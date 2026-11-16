#!/usr/bin/env node
/**
 * Build functions/_shared/worldmap-cities.js from GeoNames cities15000
 * (https://download.geonames.org/export/dump/, CC-BY 4.0) filtered to
 * population >= 100000. Regenerates a compact static list; no runtime
 * network calls.
 *
 * Usage: node scripts/build-worldmap-cities.mjs [cities15000.txt] [admin1CodesASCII.txt]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_POP = 100_000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const citiesPath = process.argv[2] || '/tmp/geonames/cities15000.txt';
const adminPath = process.argv[3] || '/tmp/geonames/admin1CodesASCII.txt';
const outPath = path.join(root, 'functions/_shared/worldmap-cities.js');

const admin = new Map();
for (const line of fs.readFileSync(adminPath, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const [code, name] = line.split('\t');
  if (code && name) admin.set(code, name.trim());
}

const rows = [];
for (const line of fs.readFileSync(citiesPath, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const p = line.split('\t');
  if (p.length < 15) continue;
  const pop = Number(p[14] || 0);
  const lat = Number(p[4]);
  const lng = Number(p[5]);
  const cc = p[8];
  const name = (p[1] || p[2] || '').trim();
  if (!Number.isFinite(pop) || pop < MIN_POP) continue;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (!/^[A-Z]{2}$/.test(cc || '') || !name) continue;
  const region = admin.get(`${cc}.${p[10]}`) || '';
  rows.push([name, region, cc, Math.round(lat * 10000) / 10000, Math.round(lng * 10000) / 10000, pop]);
}
rows.sort((a, b) => a[2].localeCompare(b[2]) || b[5] - a[5] || a[0].localeCompare(b[0]));

const body = `/**
 * Static list of large cities for worldmap nearest-city labels.
 * Generated from GeoNames cities15000 (CC-BY 4.0, https://www.geonames.org/),
 * kept when population >= ${MIN_POP}. Each row is
 * [name, admin1, country, lat, lng, population]. Do not fetch this at runtime.
 * Rebuild with: node scripts/build-worldmap-cities.mjs
 */
export const WORLDMAP_CITIES = ${JSON.stringify(rows)};
export const WORLDMAP_CITY_MIN_POPULATION = ${MIN_POP};
export const WORLDMAP_CITY_RADIUS_KM = 100;
`;
fs.writeFileSync(outPath, body);
const bytes = fs.statSync(outPath).size;
console.log(`wrote ${outPath} (${rows.length} cities, ${bytes} bytes)`);
if (bytes > 450_000) throw new Error('city list exceeded the size budget');
