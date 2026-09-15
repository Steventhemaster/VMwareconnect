import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dateState,selectVoyages,sortVoyages,partyOptions,laycan,laycanLabel,money,amountLabel,escapeHtml,snapshotCsv} from '../src/operational.js';
const asOf='2026-09-14T12:00:00Z';
const row={id:'a',name:'TEST SHIP',voyage:'2026 / 1',reference:'42',status:'OPR',start:'2026-09-01T00:00:00Z',end:'2026-09-13T00:00:00Z',ports:[{name:'TEST PORT',sequence:1}]};
test('OPR remains distinct from dates; missing dates never imply active sailing',()=>{
 assert.equal(dateState(row,asOf),'past');
 assert.equal(dateState({...row,end:'2026-10-01T00:00:00Z'},asOf),'within');
 assert.equal(dateState({...row,start:null,end:null},asOf),'unknown');
 assert.equal(selectVoyages([row],{search:'test port',state:'past',asOf}).length,1);
 assert.equal(selectVoyages([row],{search:'missing',asOf}).length,0);
});
test('public artifact has only approved display fields and stable snapshot dates',()=>{
 const s=JSON.parse(readFileSync(new URL('../src/operational-snapshot.json',import.meta.url)));
 assert.equal(s.mode,'published-snapshot');
 assert.ok(s.voyages.length>0);
 for(const v of s.voyages){
  const required=['id','dataloyId','name','voyage','reference','status','start','end','ports'];
  const optional=['charterer','operator','commercial'];
  for(const k of required)assert.ok(k in v,`missing ${k}`);
  for(const k of Object.keys(v))assert.ok(required.includes(k)||optional.includes(k),`unapproved field ${k}`);
  assert.match(v.dataloyId,/^\d+$/);
  assert.ok(v.reference.length>0);
  assert.equal(v.status,'OPR');
  for(const d of [v.start,v.end])if(d)assert.ok(d.endsWith('Z')&&!Number.isNaN(Date.parse(d)));
  for(const p of v.ports){
   const call=['name','sequence','purpose','arrivalFixed','departureFixed'],callOptional=['arrival','departure'];
   for(const k of call)assert.ok(k in p,`missing port ${k}`);
   for(const k of Object.keys(p))assert.ok(call.includes(k)||callOptional.includes(k),`unapproved port field ${k}`);
   for(const d of [p.arrival,p.departure])if(d)assert.ok(d.endsWith('Z')&&!Number.isNaN(Date.parse(d)));
  }
 }
});
test('upstream text is escaped and CSV formula values are neutralized',()=>{
 assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 assert.ok(snapshotCsv([{...row,name:'=CMD()'}],asOf).includes("'=CMD()"));
});
test('sorting keeps undated voyages last and never reorders a stable name sort',()=>{
 const a={...row,id:'a',name:'ALPHA',end:'2026-09-20T00:00:00Z'};
 const b={...row,id:'b',name:'BRAVO',end:'2026-09-10T00:00:00Z'};
 const c={...row,id:'c',name:'CHARLIE',end:null};
 assert.deepEqual(sortVoyages([a,b,c],'end').map(v=>v.id),['b','a','c']);
 assert.deepEqual(sortVoyages([c,b,a],'name').map(v=>v.id),['a','b','c']);
 assert.deepEqual(sortVoyages([c,b,a],'unknown-key').map(v=>v.id),['a','b','c']);
});
test('charterer and operator drive search, filter and options only when collected',()=>{
 const withParty={...row,id:'p',charterer:'Oldendorff',operator:'Jane Roe'};
 assert.deepEqual(partyOptions([row]),[]);
 assert.deepEqual(partyOptions([withParty,row]),['Jane Roe','Oldendorff']);
 assert.equal(selectVoyages([withParty,row],{search:'oldendorff',asOf}).length,1);
 assert.equal(selectVoyages([withParty,row],{party:'Jane Roe',asOf}).length,1);
 assert.equal(selectVoyages([withParty,row],{party:'all',asOf}).length,2);
});
test('laycan reads only from a registered window and never from an absent one',()=>{
 assert.equal(laycan(row),null);
 assert.equal(laycan({...row,commercial:{cargo:{count:1,laden:true}}}),null);
 assert.deepEqual(laycan({...row,commercial:{cargo:{laycanFrom:'2026-09-20T00:00:00Z',laycanTo:null}}}),{from:'2026-09-20T00:00:00Z',to:null});
});
test('CSV gains party and cargo columns only when those fields are present',()=>{
 assert.ok(!snapshotCsv([row],asOf).includes('Charterer'));
 const full={...row,charterer:'Oldendorff',commercial:{cargo:{description:'Urea in bulk',laycanFrom:'2026-09-20T00:00:00Z'}}};
 const csv=snapshotCsv([full],asOf);
 assert.ok(csv.includes('Charterer')&&csv.includes('Laycan from')&&csv.includes('Urea in bulk'));
});
test('laycan labels drop the repeated month and year but never the differing one',()=>{
 const win=(from,to)=>({...row,commercial:{cargo:{laycanFrom:from,laycanTo:to}}});
 assert.equal(laycanLabel(win('2026-07-24T00:00:00Z','2026-07-29T00:00:00Z')),'24–29 Jul 2026');
 assert.equal(laycanLabel(win('2026-07-28T00:00:00Z','2026-08-03T00:00:00Z')),'28 Jul – 03 Aug 2026');
 assert.equal(laycanLabel(win('2026-12-28T00:00:00Z','2027-01-04T00:00:00Z')),'28 Dec 2026 – 04 Jan 2027');
 assert.equal(laycanLabel(win('2026-07-24T00:00:00Z',null)),'24 Jul 2026');
 assert.equal(laycanLabel(row),null);
});
test('money formats the registered currency and survives a bad currency code',()=>{
 assert.equal(money(1250000,'USD'),'USD 1,250,000');
 assert.equal(money(12.75,'EUR'),'EUR 12.75');
 assert.equal(money(4200,'NOTACODE'),'NOTACODE 4,200');
 assert.equal(money(4200,null),'USD 4,200');
 for(const bad of [null,undefined,'1000',NaN,Infinity])assert.equal(money(bad,'USD'),null,`${bad} must not format`);
});
test('an absent figure, an unregistered one and an uncollected amount never read alike',()=>{
 assert.equal(amountLabel(undefined),'Not collected');
 assert.equal(amountLabel({registered:false}),'Not registered');
 assert.equal(amountLabel({registered:true,currency:'USD',amount:null}),'Registered · amount not collected');
 assert.equal(amountLabel({registered:null}),'Not determined');
 assert.equal(amountLabel({registered:true,currency:'USD',amount:0}),'USD 0');
});
