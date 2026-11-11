#!/usr/bin/env node
/**
 * One-time production backfill: rewrite grid-cell worldmap_areas
 * (keys like CC:y:x) to city: keys using the same nearestLargeCity rule
 * as new no-city visits. Merges into an existing city pin when the key
 * matches, reassigns worldmap_visitors.area_key, and deletes the old
 * grid row so visitor counts are not doubled. There is no trigger on
 * area_key updates.
 *
 * Usage:
 *   node scripts/backfill-worldmap-nearest-cities.mjs           # dry-run
 *   node scripts/backfill-worldmap-nearest-cities.mjs --apply   # mutate remote D1
 *
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Database is
 * YAITG_WORLDMAP_DB (dc3f9e8b-5b98-406d-a0d7-a0d7c355b24e).
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {nearestLargeCity} from '../functions/_shared/nearest-city.js';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DB = process.env.YAITG_WORLDMAP_DB_ID || 'dc3f9e8b-5b98-406d-a0d7-a0d7c355b24e';
const APPLY = process.argv.includes('--apply');

if (!ACCOUNT || !TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

async function query(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json'},
    body: JSON.stringify({sql, params})
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`D1 query failed: ${response.status} ${JSON.stringify(body.errors || body)}`);
  }
  return body.result?.[0]?.results || [];
}

async function totals() {
  const [areas] = await query(`SELECT COALESCE(SUM(visitors),0) AS visitors, COUNT(*) AS areas, COUNT(DISTINCT country) AS countries FROM worldmap_areas WHERE visitors>0`);
  const [visitors] = await query(`SELECT COUNT(*) AS rows, SUM(excluded=0) AS included, SUM(excluded=1) AS excluded FROM worldmap_visitors`);
  const [daily] = await query(`SELECT COUNT(*) AS days, COALESCE(SUM(visitors),0) AS visitors FROM worldmap_daily`);
  return {areas, visitors, daily};
}

const before = await totals();
const grid = await query(`SELECT area_key, lat, lng, country, region, visitors FROM worldmap_areas WHERE area_key NOT LIKE 'city:%' ORDER BY area_key`);
const plan = [];
for (const row of grid) {
  const nearest = nearestLargeCity(row.lat, row.lng, row.country, row.region);
  plan.push({
    old_key: row.area_key,
    old_lat: row.lat,
    old_lng: row.lng,
    old_region: row.region || '',
    visitors: row.visitors,
    country: row.country,
    new_key: nearest?.key || null,
    new_city: nearest?.city || null,
    new_region: nearest?.region || row.region || '',
    new_lat: nearest?.lat ?? row.lat,
    new_lng: nearest?.lng ?? row.lng,
    region_pair: nearest ? JSON.stringify([nearest.region, nearest.city]) : null
  });
}

const merges = new Map();
for (const item of plan) {
  if (!item.new_key) continue;
  merges.set(item.new_key, (merges.get(item.new_key) || 0) + 1);
}
const mergeTargets = [...merges.entries()].filter(([, n]) => n > 1).map(([k]) => k);

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  before,
  grid_rows: plan.length,
  assigned: plan.filter((p) => p.new_key).length,
  unassigned: plan.filter((p) => !p.new_key).length,
  unique_new_keys: merges.size,
  merge_keys: mergeTargets,
  expected_areas: before.areas.areas - plan.filter((p) => p.new_key).length + merges.size,
  plan
}, null, 2));

if (!APPLY) process.exit(0);

const statements = ['PRAGMA foreign_keys=ON', 'BEGIN IMMEDIATE'];
for (const item of plan) {
  if (!item.new_key) continue;
  const old = item.old_key.replace(/'/g, "''");
  const neu = item.new_key.replace(/'/g, "''");
  const pair = item.region_pair.replace(/'/g, "''");
  statements.push(`INSERT INTO worldmap_areas(area_key,lat,lng,country,region,visitors) VALUES('${neu}',${item.new_lat},${item.new_lng},'${item.country}','${pair}',0) ON CONFLICT(area_key) DO NOTHING`);
  statements.push(`UPDATE worldmap_visitors SET area_key='${neu}' WHERE area_key='${old}'`);
  statements.push(`UPDATE worldmap_areas SET visitors=visitors+(SELECT visitors FROM worldmap_areas WHERE area_key='${old}') WHERE area_key='${neu}'`);
  statements.push(`DELETE FROM worldmap_areas WHERE area_key='${old}'`);
}
statements.push('COMMIT');

mkdirSync('/tmp/worldmap-backfill', {recursive: true});
const sqlPath = path.join('/tmp/worldmap-backfill', 'apply-nearest-cities.sql');
const sql = statements.join(';\n') + ';';
writeFileSync(sqlPath, sql);
const wrangler = spawnSync('npx', ['wrangler', 'd1', 'execute', 'YAITG_WORLDMAP_DB', '--remote', '--file', sqlPath], {
  stdio: 'inherit',
  env: process.env,
  cwd: new URL('..', import.meta.url).pathname
});
if (wrangler.status !== 0) {
  console.error('apply failed');
  process.exit(wrangler.status || 1);
}
const after = await totals();
const leftover = await query(`SELECT area_key, lat, lng, country, region, visitors FROM worldmap_areas WHERE area_key NOT LIKE 'city:%' ORDER BY area_key`);
const cities = await query(`SELECT area_key, lat, lng, country, region, visitors FROM worldmap_areas WHERE visitors>0 ORDER BY visitors DESC, area_key`);
console.log(JSON.stringify({applied: true, before, after, leftover, cities}, null, 2));
if (after.areas.visitors !== before.areas.visitors || after.areas.countries !== before.areas.countries) {
  console.error('totals changed unexpectedly');
  process.exit(1);
}
if (Number(after.visitors.included) !== Number(after.areas.visitors)) {
  console.error('area visitor sum does not match included visitor rows');
  process.exit(1);
}
