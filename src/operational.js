export function dateState(v,asOf){
 if(v.end&&Date.parse(v.end)<Date.parse(asOf))return 'past';
 if(v.start&&Date.parse(v.start)>Date.parse(asOf))return 'future';
 if(v.start&&v.end)return 'within';
 return 'unknown';
}
export function selectVoyages(rows,{search='',state='all',asOf}={}){
 const q=search.trim().toLowerCase();
 return rows.filter(v=>(state==='all'||dateState(v,asOf)===state)&&(!q||[v.name,v.voyage,v.reference,...v.ports.map(p=>p.name)].some(s=>s.toLowerCase().includes(q))));
}
export function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function snapshotCsv(rows,asOf){
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+[['DATALOY SNAPSHOT',asOf],['Vessel','Voyage','Reference','Status','Ports in sequence','Registered start UTC','Registered end UTC'],...rows.map(v=>[v.name,v.voyage,v.reference,v.status,v.ports.map(p=>p.name).join(' → '),v.start,v.end])].map(r=>r.map(cell).join(',')).join('\r\n');
}
