// Run only for a snapshot the user has explicitly authorized for public review.
import {readFile,writeFile,rename} from 'node:fs/promises';
const source=JSON.parse(await readFile('data/operational-voyages.json','utf8'));
if(!source.complete||source.reportedTotal!==source.rows.length)throw new Error('INCOMPLETE_SNAPSHOT');
const utc=value=>value?(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z'):null;
// ARR/DEP and local wall-clock semantics verified against CHARLES in the tenant
// UI on 2026-09-15. Voyage *GMT fields are UTC; unzoned EventLog dates are local.
const callTime=value=>{
 if(!value)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i.test(value)||!Number.isFinite(Date.parse(utc(value))))throw Error('INVALID_CALL_DATE');
 return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)?new Date(value).toISOString():value;
};
const seen={calls:0,withArrival:0,withDeparture:0,codes:{}};
const snapshot={fetchedAt:source.fetchedAt,source:'Dataloy',mode:'published-snapshot',voyages:source.rows.map((r,i)=>{
 if(r.voyageHeader?.voyageStatus?.statusTypeCode!=='OPR')throw new Error('UNEXPECTED_STATUS');
 const purpose=p=>({L:'Loading',D:'Discharging',C:'Canal passage',E:'Extra port',DD:'Dry dock',DEL:'Delivery',RED:'Redelivery',B:'Bunkering',R:'Repair',CL:'Tank / hold cleaning',STS:'Ship to ship',W:'Waiting',CC:'Customs clearance'}[p.reasonForCall?.reasonForCall]||p.reasonForCall?.reasonForCallDesc||'Port call');
 // Requested on screen: the rotation shows when each call is scheduled, not only the voyage window.
 const eventDate=(p,code)=>{const events=(p.eventLogs||[]).filter(e=>e.event?.eventCode===code&&e.eventLogDate);if(events.length>1)throw Error('AMBIGUOUS_CALL_DATE');return events.length?callTime(events[0].eventLogDate):null;};
 const census=p=>{seen.calls++;for(const e of p.eventLogs||[]){const c=e.event?.eventCode;if(c)seen.codes[c]=(seen.codes[c]||0)+1;}};
 const fixed=(p,code)=>Boolean(p[code==='ARR'?'arrivalFixed':'departureFixed']||p.eventLogs?.some(e=>e.event?.eventCode===code&&e.isDateFixed));
 return {id:`voyage-${i+1}`,dataloyId:String(r.key),name:r.vessel?.vesselName||'Vessel unavailable',voyage:`${r.voyageHeader?.voyageStartYear??'?'} / ${r.voyageHeader?.voyageNo??'?'}`,reference:String(r.voyageHeader?.referenceNo??''),status:'OPR',start:utc(r.voyageStartDateGMT),end:utc(r.voyageEndDateGMT),ports:(r.portCalls||[]).slice().sort((a,b)=>(a.portCallSequence??Infinity)-(b.portCallSequence??Infinity)).map(p=>(census(p),{name:p.port?.portName||'Port unavailable',sequence:p.portCallSequence??null,purpose:purpose(p),arrival:eventDate(p,'ARR'),departure:eventDate(p,'DEP'),arrivalFixed:fixed(p,'ARR'),departureFixed:fixed(p,'DEP')}))};
})};
for(const v of snapshot.voyages)for(const p of v.ports){if(p.arrival)seen.withArrival++;if(p.departure)seen.withDeparture++;}
const logged=Object.values(seen.codes).reduce((a,b)=>a+b,0);
console.log(JSON.stringify({voyages:snapshot.voyages.length,vessels:new Set(snapshot.voyages.map(v=>v.name)).size,portCalls:seen.calls,eventLogs:logged,withArrival:seen.withArrival,withDeparture:seen.withDeparture,eventCodes:seen.codes}));
if(seen.calls>0&&seen.withArrival===0&&seen.withDeparture===0)throw Error(logged?'NO_CALL_DATES':'NO_EVENT_LOGS');
await writeFile('src/operational-snapshot.json.tmp',JSON.stringify(snapshot,null,2));
await rename('src/operational-snapshot.json.tmp','src/operational-snapshot.json');
