#!/usr/bin/env node
/**
 * Bake the visitor globe's land into one small equirectangular image.
 * One texture draws the whole world in a single pass, so the globe shows land
 * immediately instead of building ~180 3D country shapes in the browser.
 * Colors match the former polygon styling (ocean #15374a, land #7ab5a0, borders #c6d5bb).
 * Usage: node scripts/build-worldmap-texture.mjs   (writes img/worldmap-earth-v1.webp)
 */
import fs from 'node:fs';
import sharp from 'sharp';
import {feature} from 'topojson-client';
import {geoEquirectangular,geoPath} from 'd3-geo';
const W=4096,H=2048,OUT='img/worldmap-earth-v1.webp';
const atlas=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json'));
const land=feature(atlas,atlas.objects.countries);
const path=geoPath(geoEquirectangular().scale(W/(2*Math.PI)).translate([W/2,H/2]).precision(.1));
const shapes=land.features.map(f=>path(f)).filter(Boolean).map(d=>`<path d="${d}"/>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#15374a"/><g fill="#7ab5a0" stroke="#c6d5bb" stroke-width="2.2" stroke-linejoin="round">${shapes}</g></svg>`;
const buf=await sharp(Buffer.from(svg)).webp({quality:62,smartSubsample:true,effort:6}).toBuffer();
fs.writeFileSync(OUT,buf);
console.log(`${OUT}: ${(buf.length/1024).toFixed(1)} KiB`);
