import {mkdir,writeFile} from 'node:fs/promises';
import {oauthToken,probeRequest} from './dataloy-probe.mjs';
import {freightInvoice} from './freight-invoice.mjs';

const env=process.env;
probeRequest({...env,DATALOY_AUTH_MODE:'bearer',DATALOY_API_KEY:'validation'});
async function readJson(response){
 if(!response.ok){await response.body?.cancel();throw new Error(`HTTP_${response.status}`);}
 if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('EXPECTED_JSON');
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.byteLength;if(size>8_000_000)throw new Error('PAGE_TOO_LARGE');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
try{
 const auth=await oauthToken(env);if(!auth.ok)throw new Error(auth.code);
 const rows=[];let pages=0;let total=null;let exhausted=false;const seen=new Set();const limit=25;
 for(let page=1;page<=100;page++){
  const u=new URL(env.DATALOY_BASE_URL.replace(/\/$/,'')+'/Voyage');
  u.searchParams.set('filter','voyageHeader.voyageStatus.statusTypeCode(EQ)OPR');u.searchParams.set('pageNumber',String(page));u.searchParams.set('limit',String(limit));
  const response=await fetch(u,{headers:{Authorization:`Bearer ${auth.token}`,Accept:'application/json',fields:JSON.stringify({key:'*',isTc:'*',voyageStartDateGMT:'*',voyageEndDateGMT:'*',vessel:{vesselName:'*'},voyageHeader:{voyageNo:'*',voyageStartYear:'*',referenceNo:'*',operator:{userName:'*'},charteringResponsible:{userName:'*'},voyageStatus:{statusTypeCode:'*'}},portCalls:{portCallSequence:'*',arrivalFixed:'*',departureFixed:'*',reasonForCall:{reasonForCall:'*',reasonForCallDesc:'*'},port:{portName:'*'},eventLogs:{eventLogDate:'*',isDateFixed:'*',event:{eventCode:'*'}}}})},redirect:'error',signal:AbortSignal.timeout(30000)});
  const count=response.headers.get('totalObjectsNumber');if(count!==null&&/^\d+$/.test(count))total=Number(count);
  const data=await readJson(response);if(!Array.isArray(data))throw new Error('EXPECTED_ARRAY');pages++;
  for(const row of data){if(row.key==null||seen.has(String(row.key)))throw new Error('MISSING_OR_DUPLICATE_KEY');seen.add(String(row.key));rows.push(row);}
  if(data.length<limit){exhausted=true;break;}
 }
 const complete=exhausted&&(total===null||total===rows.length);
 if(!complete)throw Error('INCOMPLETE_VOYAGE_PULL');
 // Query the accounting lines with explicit pagination; do not assume nested
 // voyage.documentLines is complete. Collect only status and join identifiers.
 const accounting=new Map(rows.map(v=>[String(v.key),[]]));
 for(let start=0;start<rows.length;start+=15){
  const keys=rows.slice(start,start+15).map(v=>v.key);
  const lineKeys=new Set();let ended=false,lineTotal=null;
  for(let page=1;page<=100;page++){
   const u=new URL(env.DATALOY_BASE_URL.replace(/\/$/,'')+'/DocumentLine');
   u.searchParams.set('filter',`voyage.key(IN)(${keys.join(',')})`);u.searchParams.set('pageNumber',String(page));u.searchParams.set('limit','100');
   const fields={key:'*',voyage:{key:'*'},account:{accountCode:'*'},invoicingStatus:{statusTypeCode:'*'},document:{key:'*',invoiced:'*',assembled:'*',reversed:'*',documentType:{documentType:'*'},invoicingStatus:{statusTypeCode:'*'}}};
   const response=await fetch(u,{headers:{Authorization:`Bearer ${auth.token}`,Accept:'application/json',fields:JSON.stringify(fields)},redirect:'error',signal:AbortSignal.timeout(30000)});
   const count=response.headers.get('totalObjectsNumber');if(count!==null&&/^\d+$/.test(count))lineTotal=Number(count);
   const data=await readJson(response);if(!Array.isArray(data))throw Error('EXPECTED_DOCUMENT_LINES');
   for(const line of data){if(line.key==null||lineKeys.has(String(line.key))||!accounting.has(String(line.voyage?.key)))throw Error('INVALID_DOCUMENT_LINE');lineKeys.add(String(line.key));accounting.get(String(line.voyage.key)).push(line);}
   if(data.length<100){ended=true;break;}
  }
  if(!ended||(lineTotal!==null&&lineTotal!==lineKeys.size))throw Error('INCOMPLETE_INVOICE_PULL');
 }
 for(const row of rows)row.freightInvoice=freightInvoice(accounting.get(String(row.key)));
 await mkdir('data',{recursive:true});
 const snapshot={fetchedAt:new Date().toISOString(),filter:'OPR',complete,pages,reportedTotal:total,count:rows.length,rows};
 await writeFile('data/operational-voyages.json',JSON.stringify(snapshot,null,2));
 console.log(JSON.stringify({fetchedAt:snapshot.fetchedAt,complete,pages,reportedTotal:total,count:rows.length,invoiceStatusCounts:rows.reduce((a,v)=>(a[v.freightInvoice.status]=(a[v.freightInvoice.status]||0)+1,a),{})}));
 if(!complete)process.exitCode=1;
}catch(error){console.log(JSON.stringify({ok:false,code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'FETCH_FAILED'}));process.exitCode=1;}
