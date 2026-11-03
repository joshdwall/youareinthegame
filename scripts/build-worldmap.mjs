import fs from 'node:fs';import {feature} from 'topojson-client';
const dest='assets/worldmap';fs.mkdirSync(dest,{recursive:true});
fs.copyFileSync('node_modules/globe.gl/dist/globe.gl.min.js',dest+'/globe.gl.min.js');
const atlas=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json'));fs.writeFileSync(dest+'/countries.geojson',JSON.stringify(feature(atlas,atlas.objects.countries)));
fs.writeFileSync(dest+'/LICENSES.txt','Globe.GL: MIT\n'+fs.readFileSync('node_modules/globe.gl/LICENSE','utf8')+'\nWorld Atlas: ISC; boundary data derived from public-domain Natural Earth.\n'+fs.readFileSync('node_modules/world-atlas/LICENSE','utf8')+'\nTopoJSON Client: ISC\n'+fs.readFileSync('node_modules/topojson-client/LICENSE','utf8'));
console.log('Built pinned local globe component and country boundaries.');
