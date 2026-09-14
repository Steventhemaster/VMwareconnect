import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {ports, ageHours} from './data.js';
maplibregl.setWorkerUrl(workerUrl);
export function createFleetMap(container, vessels, onSelect){
 const map=new maplibregl.Map({container,style:{version:8,sources:{countries:{type:'geojson',data:'/countries.geojson',attribution:'Natural Earth · MapLibre'}},layers:[{id:'ocean',type:'background',paint:{'background-color':'#e9f0f1'}},{id:'land',type:'fill',source:'countries',paint:{'fill-color':'#fbfbf6'}},{id:'coast',type:'line',source:'countries',paint:{'line-color':'#d4ddda','line-width':0.7}}]},center:[74,12],zoom:2.5,minZoom:1.3,maxZoom:8,attributionControl:{compact:true},renderWorldCopies:false});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
 const markers=[];
 for(const p of ports){const el=document.createElement('div');el.className='port-label';el.textContent=p.name;new maplibregl.Marker({element:el,anchor:'top-left',offset:[4,4]}).setLngLat(p.position).addTo(map);}
 for(const [name,pos] of [['INDIA',[79,23]],['ARABIAN SEA',[64,13]],['INDIAN OCEAN',[78,-5]],['SRI LANKA',[81.4,6.2]],['OMAN',[57,21]],['BAY OF BENGAL',[89,15]]]){const el=document.createElement('div');el.className='region-label'+(name.includes('SEA')||name.includes('OCEAN')?' water':'');el.textContent=name;new maplibregl.Marker({element:el}).setLngLat(pos).addTo(map);}
 function update(list){markers.splice(0).forEach(m=>m.remove());for(const v of list.filter(v=>v.position)){const el=document.createElement('button');el.className=`ship-marker ${v.severity} ${ageHours(v)>30?'stale':''}`;el.title=`${v.name} · ${v.status}`;el.setAttribute('aria-label',`${v.name} 지도에서 상세 보기`);el.innerHTML=`<span class="ship-arrow" style="transform:rotate(${v.course}deg)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 17 4 21Z"/></svg></span><span class="ship-name">${v.name}</span>`;el.addEventListener('click',()=>onSelect(v.id));markers.push(new maplibregl.Marker({element:el}).setLngLat(v.position).addTo(map));}}
 map.on('load',()=>{map.addSource('track',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'track',type:'line',source:'track',paint:{'line-color':'#357f75','line-width':2,'line-dasharray':[2,3]}});update(vessels);});
 map.on('error',()=>{const note=document.querySelector('#map-status');if(note)note.textContent='지도를 불러오지 못하면 아래 선박 표를 이용해 주세요.';});
 return {map,update,select(v){if(map.getSource('track'))map.getSource('track').setData({type:'FeatureCollection',features:v.track.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:v.track}}]:[]});},reset(){map.flyTo({center:[74,12],zoom:2.5,duration:500});},destroy(){map.remove();}};
}
