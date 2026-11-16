/**
 * Nearest-large-city assignment for worldmap pins that have no Cloudflare city.
 *
 * Rule (same-country first):
 *  1. Look at catalog cities in the visitor's country (or worldwide if that
 *     country has none in the list).
 *  2. If any of those cities are within 50 km, pick the most populous
 *     (same metro / this grid cell).
 *  3. Else if any are within WORLDMAP_CITY_RADIUS_KM (100 km), pick the
 *     most populous in that ring.
 *  4. Otherwise pick the nearest catalog city in that pool.
 */
import {WORLDMAP_CITIES, WORLDMAP_CITY_RADIUS_KM} from './worldmap-cities.js';

// Prefer the most populous city in the same metro (~half a 1° cell) when one
// exists, then fall back to the 100 km cell, then to the nearest catalog city.
export const WORLDMAP_CITY_INNER_RADIUS_KM = 50;

const EARTH_KM = 6371;

export function cleanPlaceName(value) {
  return String(value || '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 60);
}

export function cityAreaKey(country, region, city) {
  return `city:${country}:${JSON.stringify([region, city]).toLowerCase()}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestLargeCity(lat, lng, country, regionHint) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const inCountry = WORLDMAP_CITIES.filter((row) => row[2] === country);
  const pool = inCountry.length ? inCountry : WORLDMAP_CITIES;
  let nearest = null, nearestKm = Infinity;
  let bestInner = null, bestOuter = null;
  for (const row of pool) {
    const km = haversineKm(lat, lng, row[3], row[4]);
    if (km < nearestKm) {
      nearestKm = km;
      nearest = row;
    }
    if (km <= WORLDMAP_CITY_INNER_RADIUS_KM && (!bestInner || row[5] > bestInner[5])) bestInner = row;
    if (km <= WORLDMAP_CITY_RADIUS_KM && (!bestOuter || row[5] > bestOuter[5])) bestOuter = row;
  }
  const chosen = bestInner || bestOuter || nearest;
  if (!chosen) return null;
  const city = cleanPlaceName(chosen[0]);
  if (!city) return null;
  const region = cleanPlaceName(regionHint) || cleanPlaceName(chosen[1]);
  return {
    key: cityAreaKey(country, region, city),
    lat: Math.round(chosen[3] * 10) / 10,
    lng: Math.round(chosen[4] * 10) / 10,
    country,
    region,
    city
  };
}
