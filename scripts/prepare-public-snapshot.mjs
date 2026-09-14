// Run only for a snapshot the user has explicitly authorized for public review.
import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('data/operational-voyages.json','utf8'));
if(!source.complete||source.reportedTotal!==source.rows.length)throw new Error('INCOMPLETE_SNAPSHOT');
const utc=value=>value?(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z'):null;
const snapshot={fetchedAt:source.fetchedAt,source:'Dataloy',mode:'published-snapshot',voyages:source.rows.map((r,i)=>{
 if(r.voyageHeader?.voyageStatus?.statusTypeCode!=='OPR')throw new Error('UNEXPECTED_STATUS');
 return {id:`voyage-${i+1}`,name:r.vessel?.vesselName||'선박명 미확인',voyage:`${r.voyageHeader?.voyageStartYear??'?'} / ${r.voyageHeader?.voyageNo??'?'}`,reference:String(r.referenceNo??''),status:'OPR',start:utc(r.voyageStartDateGMT),end:utc(r.voyageEndDateGMT),ports:(r.portCalls||[]).slice().sort((a,b)=>(a.portCallSequence??Infinity)-(b.portCallSequence??Infinity)).map(p=>({name:p.port?.portName||'기항명 미확인',sequence:p.portCallSequence??null}))};
})};
await writeFile('src/operational-snapshot.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({voyages:snapshot.voyages.length,vessels:new Set(snapshot.voyages.map(v=>v.name)).size}));
