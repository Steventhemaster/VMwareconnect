export function dateState(v,asOf){
 if(v.end&&Date.parse(v.end)<Date.parse(asOf))return 'past';
 if(v.start&&Date.parse(v.start)>Date.parse(asOf))return 'future';
 if(v.start&&v.end)return 'within';
 return 'unknown';
}
export function selectVoyages(rows,{search='',state='all',asOf}={}){
 const q=search.trim().toLowerCase();
 return rows.filter(v=>(state==='all'||dateState(v,asOf)===state)&&(!q||[v.name,v.voyage,v.reference,...(v.ports||[]).flatMap(p=>[p.name,p.purpose])].some(s=>String(s??'').toLowerCase().includes(q))));
}
export function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function snapshotCsv(rows,asOf){
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+[['DATALOY SNAPSHOT',asOf],['Vessel','Voyage','Reference','Status','Ports in sequence','Registered start UTC','Registered end UTC'],...rows.map(v=>[v.name,v.voyage,v.reference,v.status,v.ports.map(p=>p.name).join(' → '),v.start,v.end])].map(r=>r.map(cell).join(',')).join('\r\n');
}

/* ---------------------------------------------------------------------------
   Derived reading of the registered dates.

   The snapshot's only measurable axis is how a voyage sits against its own
   registered end. That spread is wide — 1 to 102 days across the exceptions —
   so it carries far more than the pass/fail badge it was previously reduced to.
   Everything below comes from fields the snapshot already holds; nothing is
   inferred about where a vessel is or whether it is sailing.
   ------------------------------------------------------------------------ */

const DAY = 86400000;

/* Shape token per state, so nothing depends on colour alone, plus the rank
   that puts exceptions at the top of an unsorted list. */
export const STATE_META = {
  past:    {label:'End date passed', short:'Past end',   mark:'■', rank:0},
  within:  {label:'Within schedule', short:'In schedule',mark:'·', rank:1},
  future:  {label:'Not started',     short:'Not started',mark:'▸', rank:2},
  unknown: {label:'Dates unavailable',short:'No dates',  mark:'▨', rank:3},
};

/* Whole days between the registered end and the snapshot instant.
   Positive = days past the registered end. Negative = days still to run. */
export function dayDelta(v,asOf){
  if(!v||!v.end)return null;
  const ms=Date.parse(asOf)-Date.parse(v.end);
  return Number.isNaN(ms)?null:Math.round(ms/DAY);
}

/* Short form for a column: reads as a magnitude, not a sentence. */
export function deltaShort(v,asOf){
  const d=dayDelta(v,asOf);
  if(d===null)return {text:'—',tone:'none',title:'No registered end date'};
  if(d>0)return {text:`${d}d past`,tone:'past',title:`${d} days past the registered end date`};
  if(d<0)return {text:`${-d}d left`,tone:-d<=7?'soon':'ahead',title:`${-d} days until the registered end date`};
  return {text:'ends today',tone:'soon',title:'The registered end date falls on the snapshot date'};
}

/* Exceptions first and largest overrun first, so the worst case can never sit
   below a lesser one because of its name. Inside the in-schedule group the
   voyages closest to their end date come first — those tip over next. */
export function sortVoyages(rows,asOf,mode='attention'){
  const by=(v)=>STATE_META[dateState(v,asOf)].rank;
  const d=(v)=>dayDelta(v,asOf);
  return rows.slice().sort((a,b)=>{
    if(mode==='name')return a.name.localeCompare(b.name)||a.voyage.localeCompare(b.voyage,undefined,{numeric:true});
    if(mode==='end')return (a.end||'').localeCompare(b.end||'');
    if(mode==='delta')return (d(b)??-Infinity)-(d(a)??-Infinity);
    return by(a)-by(b) || ((d(b)??-Infinity)-(d(a)??-Infinity)) || a.name.localeCompare(b.name);
  });
}

/* The call the rotation is currently pointed at: the first without a fixed
   departure. This is Dataloy's registered position in the rotation, not a
   claim about where the vessel physically is. */
export function focusIndex(v){
  if(!v||!v.ports||!v.ports.length)return -1;
  const i=v.ports.findIndex(p=>!p.departureFixed);
  return i===-1?v.ports.length-1:i;
}

export function callStage(p){
  return p.departureFixed?'complete':p.arrivalFixed?'current':'scheduled';
}

export function counts(rows,asOf){
  const out={all:rows.length,past:0,within:0,future:0,unknown:0,
             vessels:new Set(rows.map(v=>v.name)).size,calls:0};
  for(const v of rows){out[dateState(v,asOf)]++;out.calls+=(v.ports||[]).length;}
  return out;
}
