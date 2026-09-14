import {writeFile} from 'node:fs/promises';
const url='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const response=await fetch(url);if(!response.ok)throw new Error(`Map download failed: ${response.status}`);
const data=await response.json();
const round=v=>Array.isArray(v)?v.map(round):Math.round(v*1000)/1000;
const minimal={type:'FeatureCollection',features:data.features.map(f=>({type:'Feature',properties:{name:f.properties.NAME},geometry:{type:f.geometry.type,coordinates:round(f.geometry.coordinates)}}))};
await writeFile('public/countries.geojson',JSON.stringify(minimal));
console.log(`Saved ${minimal.features.length} country geometries.`);
