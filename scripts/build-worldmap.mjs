import fs from 'node:fs';import {feature} from 'topojson-client';import {geoArea,geoCentroid} from 'd3-geo';import iso from 'i18n-iso-countries';
const dest='assets/worldmap';fs.mkdirSync(dest,{recursive:true});
fs.copyFileSync('node_modules/globe.gl/dist/globe.gl.min.js',dest+'/globe.gl.min.js');
const atlas=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json'));// Two decimals (~1 km) is far finer than the 110m atlas and cuts the download by more than half.
const round=c=>typeof c[0]==='number'?[Math.round(c[0]*100)/100,Math.round(c[1]*100)/100]:c.map(round);
const land=feature(atlas,atlas.objects.countries);for(const f of land.features)if(f.geometry)f.geometry.coordinates=round(f.geometry.coordinates);fs.writeFileSync(dest+'/countries.geojson',JSON.stringify(land));
const features=feature(atlas,atlas.objects.countries).features,centers={};
for(const code of Object.keys(iso.getAlpha2Codes()).sort()){
 const numeric=iso.alpha2ToNumeric(code),f=features.find(f=>String(f.id).padStart(3,'0')===numeric);if(!f)continue;
 const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates.map(coordinates=>({type:'Polygon',coordinates})):[f.geometry];const largest=polygons.sort((a,b)=>geoArea(b)-geoArea(a))[0];const [lng,lat]=geoCentroid(largest);if(Number.isFinite(lat)&&Number.isFinite(lng))centers[code]={lat:Number(lat.toFixed(4)),lng:Number(lng.toFixed(4))};
}
const kosovo=features.find(f=>f.properties?.name==='Kosovo');if(kosovo){const[lng,lat]=geoCentroid(kosovo);centers.XK={lat:Number(lat.toFixed(4)),lng:Number(lng.toFixed(4))};}
fs.mkdirSync('runtime/worldmap',{recursive:true});fs.writeFileSync('runtime/worldmap/country-centers.js','// Representative country markers from the largest Natural Earth land polygon; not visitor coordinates.\nexport const COUNTRY_CENTERS='+JSON.stringify(centers,null,2)+';\n');
fs.writeFileSync(dest+'/LICENSES.txt','Globe.GL: MIT\n'+fs.readFileSync('node_modules/globe.gl/LICENSE','utf8')+'\nWorld Atlas: ISC; boundary data derived from public-domain Natural Earth.\n'+fs.readFileSync('node_modules/world-atlas/LICENSE','utf8')+'\nTopoJSON Client: ISC\n'+fs.readFileSync('node_modules/topojson-client/LICENSE','utf8'));
console.log('Built pinned local globe component and country boundaries.');
