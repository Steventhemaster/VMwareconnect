import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {ports, ageHours} from './data.js';
maplibregl.setWorkerUrl(workerUrl);

/* Only the four large water/landmass names survive, and they sit behind the pins.
   OMAN and SRI LANKA were dropped: both sat directly under vessel positions. */
const REGIONS=[['INDIA',[79,23],false],['ARABIAN SEA',[63,12],true],['BAY OF BENGAL',[89,16],true],['INDIAN OCEAN',[76,-6],true]];

export function createFleetMap(container, vessels, onSelect){
 const map=new maplibregl.Map({container,style:{version:8,sources:{countries:{type:'geojson',data:'/countries.geojson',attribution:'Natural Earth · MapLibre'}},layers:[
   {id:'ocean',type:'background',paint:{'background-color':'#e2e9e8'}},
   {id:'land',type:'fill',source:'countries',paint:{'fill-color':'#f5f2e9'}},
   {id:'coast',type:'line',source:'countries',paint:{'line-color':'#cbd2cb','line-width':0.7}}]},
  center:[74,12],zoom:2.3,minZoom:1.3,maxZoom:8,attributionControl:{compact:true},renderWorldCopies:false});
 /* top-right sits over open water at every zoom this map reaches; bottom-right
   put the zoom buttons straight on top of the Singapore pin. */
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');

 const markers=[]; const byId=new Map(); let currentVessels=vessels, selectedId=null, pinnedId=null;
 function fitFleet(duration=0){const points=vessels.filter(v=>v.position).map(v=>v.position);if(points.length)map.fitBounds(points.reduce((b,p)=>b.extend(p),new maplibregl.LngLatBounds(points[0],points[0])),{padding:{top:30,bottom:40,left:44,right:58},maxZoom:3,duration});}

 /* Chart-style port marks: a small cross plus the name over its UN/LOCODE. */
 for(const p of ports){const el=document.createElement('div');el.className='port-mark';el.innerHTML=`<i aria-hidden="true"></i><span><b>${p.name}</b><em>${p.code}</em></span>`;new maplibregl.Marker({element:el,anchor:'top',offset:[0,-2]}).setLngLat(p.position).addTo(map);}
 for(const [name,pos,water] of REGIONS){const el=document.createElement('div');el.className='region-label'+(water?' water':'');el.textContent=name;new maplibregl.Marker({element:el}).setLngLat(pos).addTo(map);}

 function update(list){
  currentVessels=list;markers.splice(0).forEach(m=>m.remove());byId.clear();
  for(const v of list.filter(v=>v.position)){
   const el=document.createElement('button');
   /* The name label flips to the left of the pin for anything east of 92°E so it
      can never run off the right-hand frame edge (Singapore, Port Klang). */
   el.className=`pin sev-${v.severity}${ageHours(v)>30?' stale':''}${v.position[0]>92?' flip':''}`;
   el.dataset.vessel=v.id;
   el.setAttribute('aria-label',`${v.name} — ${v.status}, ${v.severity==='ok'?'aligned':'needs review'}. Open detail.`);
   /* A berthed or anchored vessel has no heading to show — the dataset's course
      is filler at 0.0 kn, and drawing it would present an unverified value as
      fact. The arrowhead is rendered only for a vessel actually making way. */
   const heading=v.speed>0?`<span class="pin-heading" style="transform:rotate(${v.course}deg)" aria-hidden="true"></span>`:'';
   el.innerHTML=`${heading}<span class="pin-code">${v.short}</span><span class="pin-label" aria-hidden="true">${v.name}</span>`;
   el.addEventListener('click',()=>onSelect(v.id));
   byId.set(v.id,el);
   markers.push(new maplibregl.Marker({element:el,anchor:'bottom',offset:[0,-4]}).setLngLat(v.position).addTo(map));
  }
  apply();
 }
 function apply(){for(const [id,el] of byId){el.classList.toggle('selected',id===selectedId);el.classList.toggle('lit',id===pinnedId);}}

 map.on('load',()=>{map.addSource('track',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'track',type:'line',source:'track',paint:{'line-color':'#1d5a52','line-width':1.6,'line-dasharray':[2,2.5],'line-opacity':.75}});update(currentVessels);fitFleet();});
 map.on('error',()=>{const note=document.querySelector('#map-status');if(note)note.textContent='If the map does not load, the vessel list above carries every reported position.';});

 return {map,update,
  select(v){selectedId=v.id;apply();if(map.getSource('track'))map.getSource('track').setData({type:'FeatureCollection',features:v.track.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:v.track}}]:[]});},
  highlight(id){pinnedId=id;apply();},
  reset(){selectedId=null;pinnedId=null;apply();if(map.getSource('track'))map.getSource('track').setData({type:'FeatureCollection',features:[]});fitFleet(400);},
  destroy(){map.remove();}};
}
