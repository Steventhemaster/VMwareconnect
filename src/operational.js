export function dateState(v,asOf){
 if(v.end&&Date.parse(v.end)<Date.parse(asOf))return 'past';
 if(v.start&&Date.parse(v.start)>Date.parse(asOf))return 'future';
 if(v.start&&v.end)return 'within';
 return 'unknown';
}
export function partyOptions(rows){return [...new Set(rows.flatMap(v=>[v.charterer,v.operator]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
export function voyageHaystack(v){return [v.name,v.voyage,v.reference,v.charterer,v.operator,v.commercial?.cargo?.description,...v.ports.map(p=>p.name),...v.ports.map(p=>p.purpose)].filter(Boolean);}
export function selectVoyages(rows,{search='',state='all',party='all',asOf}={}){
 const q=search.trim().toLowerCase();
 return rows.filter(v=>(state==='all'||dateState(v,asOf)===state)&&(party==='all'||v.charterer===party||v.operator===party)&&(!q||voyageHaystack(v).some(s=>String(s).toLowerCase().includes(q))));
}
export const SORTS=[['name','Vessel name'],['start','Registered start'],['end','Registered end'],['reference','Voyage reference'],['party','Charterer / operator']];
export function sortVoyages(rows,key){
 const name=(a,b)=>a.name.localeCompare(b.name)||String(a.voyage).localeCompare(String(b.voyage),undefined,{numeric:true});
 const text=(v,k)=>String(v[k]??'');
 // Voyages without the sorted date sort last in either direction rather than ahead of dated ones.
 const time=(v,k)=>v[k]?Date.parse(v[k]):Infinity;
 return rows.slice().sort({
  name,
  start:(a,b)=>time(a,'start')-time(b,'start')||name(a,b),
  end:(a,b)=>time(a,'end')-time(b,'end')||name(a,b),
  reference:(a,b)=>text(a,'reference').localeCompare(text(b,'reference'),undefined,{numeric:true})||name(a,b),
  party:(a,b)=>(text(a,'charterer')||text(a,'operator')||'￿').localeCompare(text(b,'charterer')||text(b,'operator')||'￿')||name(a,b)
 }[key]||name);
}
export function laycan(v){
 const c=v.commercial?.cargo;
 if(!c||(!c.laycanFrom&&!c.laycanTo))return null;
 return {from:c.laycanFrom||null,to:c.laycanTo||null};
}
// Compact laycan range: drop the repeated month and year so it fits beside the voyage number.
export function laycanLabel(v,timeZone='UTC'){
 const l=laycan(v);
 if(!l)return null;
 const part=(value,opts)=>new Intl.DateTimeFormat('en-GB',{timeZone,...opts}).format(new Date(value));
 const full=value=>part(value,{day:'2-digit',month:'short',year:'numeric'});
 if(!l.from||!l.to)return full(l.from||l.to);
 const sameYear=part(l.from,{year:'numeric'})===part(l.to,{year:'numeric'});
 const sameMonth=sameYear&&part(l.from,{month:'short'})===part(l.to,{month:'short'});
 if(sameMonth)return `${part(l.from,{day:'2-digit'})}\u2013${full(l.to)}`;
 if(sameYear)return `${part(l.from,{day:'2-digit',month:'short'})} \u2013 ${full(l.to)}`;
 return `${full(l.from)} \u2013 ${full(l.to)}`;
}
export function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function snapshotCsv(rows,asOf){
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const parties=rows.some(v=>v.charterer||v.operator),cargo=rows.some(v=>laycan(v));
 const head=['Vessel','Voyage','Reference','Status',...parties?['Charterer','Operator']:[],...cargo?['Cargo','Laycan from','Laycan to']:[],'Ports in sequence','Registered start UTC','Registered end UTC'];
 const line=v=>{const l=laycan(v);return [v.name,v.voyage,v.reference,v.status,...parties?[v.charterer,v.operator]:[],...cargo?[v.commercial?.cargo?.description,l?.from,l?.to]:[],v.ports.map(p=>p.name).join(' → '),v.start,v.end];};
 return '﻿'+[['DATALOY SNAPSHOT',asOf],head,...rows.map(line)].map(r=>r.map(cell).join(',')).join('\r\n');
}
