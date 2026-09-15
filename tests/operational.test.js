import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dateState,selectVoyages,escapeHtml,snapshotCsv,
        commercial,anyCommercial,ladenLabel,invoiceLabel,laytimeLabel} from '../src/operational.js';
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
test('cargo, invoicing and laytime degrade honestly when absent',()=>{
 const bare=commercial({id:'a'});
 assert.equal(bare.present,false);
 for(const g of ['cargo','invoices','laytime'])assert.equal(bare[g].present,false);
 assert.equal(ladenLabel(bare).text,'not collected');
 assert.equal(invoiceLabel(bare).text,'not collected');
 assert.equal(laytimeLabel(bare).text,'not collected');
 assert.equal(anyCommercial([{id:'a'},{id:'b'}]),false);
 // an explicit null is "not determined", which is not the same as "none"
 const undetermined=commercial({commercial:{cargo:{laden:null},laytime:{registered:null}}});
 assert.equal(ladenLabel(undetermined).text,'not determined');
 assert.equal(laytimeLabel(undetermined).text,'not determined');
 // and never a zero or a finding
 assert.notEqual(invoiceLabel(bare).text,'0 invoices');
});
test('cargo, invoicing and laytime read through when present',()=>{
 const v={commercial:{cargo:{count:2,laden:true},
   invoices:{count:3,statuses:[{code:'RFP',label:'Ready for posting',count:2},{code:'POST',label:'Posted',count:1}]},
   laytime:{registered:true,outcome:'demurrage'}}};
 const c=commercial(v);
 assert.equal(anyCommercial([v]),true);
 assert.equal(ladenLabel(c).text,'Laden · 2 cargoes');
 assert.match(invoiceLabel(c).text,/^3 invoices · Ready for posting 2$/);
 assert.equal(invoiceLabel(c).detail,'Ready for posting: 2 · Posted: 1');
 assert.equal(laytimeLabel(c).text,'Demurrage registered');
 assert.equal(laytimeLabel(commercial({commercial:{laytime:{registered:false}}})).text,'Laytime not registered');
 assert.equal(ladenLabel(commercial({commercial:{cargo:{laden:false}}})).text,'Ballast');
 // a tenant code we have never seen is passed through, not mapped onto ours
 const odd=commercial({commercial:{invoices:{count:1,statuses:[{code:'XX9',count:1}]}}});
 assert.match(invoiceLabel(odd).text,/XX9/);
});
