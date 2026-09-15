// Run only for a snapshot the user has explicitly authorized for public review.
import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('data/operational-voyages.json','utf8'));
if(!source.complete||source.reportedTotal!==source.rows.length)throw new Error('INCOMPLETE_SNAPSHOT');
const utc=value=>value?(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z'):null;
// ARR and DEP are an assumption about this tenant's event codes, not a verified fact:
// the fixed-date flags can be satisfied by portCall.arrivalFixed alone, so the eventLogs
// path may never have run against real data. Census what actually arrives, so a run that
// matches no code says so instead of emitting a snapshot full of nulls.
const seen={calls:0,withArrival:0,withDeparture:0,codes:{}};
const snapshot={fetchedAt:source.fetchedAt,source:'Dataloy',mode:'published-snapshot',voyages:source.rows.map((r,i)=>{
 if(r.voyageHeader?.voyageStatus?.statusTypeCode!=='OPR')throw new Error('UNEXPECTED_STATUS');
 const purpose=p=>({L:'Loading',D:'Discharging',C:'Canal passage',E:'Extra port',DD:'Dry dock',DEL:'Delivery',RED:'Redelivery',B:'Bunkering',R:'Repair',CL:'Tank / hold cleaning',STS:'Ship to ship',W:'Waiting',CC:'Customs clearance'}[p.reasonForCall?.reasonForCall]||p.reasonForCall?.reasonForCallDesc||'Port call');
 // Requested on screen: the rotation shows when each call is scheduled, not only the voyage window.
 const eventDate=(p,code)=>{const e=(p.eventLogs||[]).find(e=>e.event?.eventCode===code&&e.eventLogDate);return e?utc(e.eventLogDate):null;};
 const census=p=>{seen.calls++;for(const e of p.eventLogs||[]){const c=e.event?.eventCode;if(c)seen.codes[c]=(seen.codes[c]||0)+1;}};
 const fixed=(p,code)=>Boolean(p[code==='ARR'?'arrivalFixed':'departureFixed']||p.eventLogs?.some(e=>e.event?.eventCode===code&&e.isDateFixed));
 return {id:`voyage-${i+1}`,dataloyId:String(r.key),name:r.vessel?.vesselName||'Vessel unavailable',voyage:`${r.voyageHeader?.voyageStartYear??'?'} / ${r.voyageHeader?.voyageNo??'?'}`,reference:String(r.voyageHeader?.referenceNo??''),status:'OPR',start:utc(r.voyageStartDateGMT),end:utc(r.voyageEndDateGMT),ports:(r.portCalls||[]).slice().sort((a,b)=>(a.portCallSequence??Infinity)-(b.portCallSequence??Infinity)).map(p=>(census(p),{name:p.port?.portName||'Port unavailable',sequence:p.portCallSequence??null,purpose:purpose(p),arrival:eventDate(p,'ARR'),departure:eventDate(p,'DEP'),arrivalFixed:fixed(p,'ARR'),departureFixed:fixed(p,'DEP')}))};
})};
for(const v of snapshot.voyages)for(const p of v.ports){if(p.arrival)seen.withArrival++;if(p.departure)seen.withDeparture++;}
const logged=Object.values(seen.codes).reduce((a,b)=>a+b,0);
await writeFile('src/operational-snapshot.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({voyages:snapshot.voyages.length,vessels:new Set(snapshot.voyages.map(v=>v.name)).size,portCalls:seen.calls,eventLogs:logged,withArrival:seen.withArrival,withDeparture:seen.withDeparture,eventCodes:seen.codes}));
if(logged>0&&seen.withArrival===0&&seen.withDeparture===0)console.error(`NO_CALL_DATES: ${logged} event logs carried none of the codes this projector reads. Seen instead: ${Object.keys(seen.codes).join(', ')}. The rotation will show no dates until ARR/DEP here are replaced with the tenant's own codes.`);
else if(logged===0)console.error('NO_EVENT_LOGS: no port call carried an event log, so the rotation will show no dates. Check that fetch-operational.mjs still requests portCalls.eventLogs.');
