// Run only for a snapshot the user has explicitly authorized for public review.
import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('data/operational-voyages.json','utf8'));
if(!source.complete||source.reportedTotal!==source.rows.length)throw new Error('INCOMPLETE_SNAPSHOT');
const utc=value=>value?(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z'):null;
const snapshot={fetchedAt:source.fetchedAt,source:'Dataloy',mode:'published-snapshot',voyages:source.rows.map((r,i)=>{
 if(r.voyageHeader?.voyageStatus?.statusTypeCode!=='OPR')throw new Error('UNEXPECTED_STATUS');
 const purpose=p=>({L:'Loading',D:'Discharging',C:'Canal passage',E:'Extra port',DD:'Dry dock',DEL:'Delivery',RED:'Redelivery',B:'Bunkering',R:'Repair',CL:'Tank / hold cleaning',STS:'Ship to ship',W:'Waiting',CC:'Customs clearance'}[p.reasonForCall?.reasonForCall]||p.reasonForCall?.reasonForCallDesc||'Port call');
 const fixed=(p,code)=>Boolean(p[code==='ARR'?'arrivalFixed':'departureFixed']||p.eventLogs?.some(e=>e.event?.eventCode===code&&e.isDateFixed));
 return {id:`voyage-${i+1}`,dataloyId:String(r.key),name:r.vessel?.vesselName||'Vessel unavailable',voyage:`${r.voyageHeader?.voyageStartYear??'?'} / ${r.voyageHeader?.voyageNo??'?'}`,reference:String(r.voyageHeader?.referenceNo??''),status:'OPR',start:utc(r.voyageStartDateGMT),end:utc(r.voyageEndDateGMT),ports:(r.portCalls||[]).slice().sort((a,b)=>(a.portCallSequence??Infinity)-(b.portCallSequence??Infinity)).map(p=>({name:p.port?.portName||'Port unavailable',sequence:p.portCallSequence??null,purpose:purpose(p),arrivalFixed:fixed(p,'ARR'),departureFixed:fixed(p,'DEP')}))};
})};
await writeFile('src/operational-snapshot.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({voyages:snapshot.voyages.length,vessels:new Set(snapshot.voyages.map(v=>v.name)).size}));
