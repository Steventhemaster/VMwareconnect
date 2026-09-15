import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dateState,selectVoyages,escapeHtml,snapshotCsv} from '../src/operational.js';
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
  assert.deepEqual(Object.keys(v).sort(),['id','dataloyId','name','voyage','reference','status','start','end','ports'].sort());
  assert.match(v.dataloyId,/^\d+$/);
  assert.ok(v.reference.length>0);
  assert.equal(v.status,'OPR');
  for(const d of [v.start,v.end])if(d)assert.ok(d.endsWith('Z')&&!Number.isNaN(Date.parse(d)));
  for(const p of v.ports)assert.deepEqual(Object.keys(p).sort(),['name','sequence','purpose','arrivalFixed','departureFixed'].sort());
 }
});
test('upstream text is escaped and CSV formula values are neutralized',()=>{
 assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 assert.ok(snapshotCsv([{...row,name:'=CMD()'}],asOf).includes("'=CMD()"));
});
