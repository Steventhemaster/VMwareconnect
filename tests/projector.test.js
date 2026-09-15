import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const script=resolve(import.meta.dirname,'../scripts/prepare-public-snapshot.mjs');

// Shape mirrors what fetch-operational.mjs requests from Dataloy, field for field.
const call=(sequence,portName,reason,eventLogs=[],flags={})=>({portCallSequence:sequence,arrivalFixed:flags.arrivalFixed??false,departureFixed:flags.departureFixed??false,reasonForCall:{reasonForCall:reason},port:{portName},eventLogs});
const log=(eventCode,eventLogDate,isDateFixed=false)=>({eventLogDate,isDateFixed,event:{eventCode}});
const voyage=(portCalls)=>({key:29937717,voyageStartDateGMT:'2026-07-03T22:01:00',voyageEndDateGMT:'2026-09-12T07:30:00',vessel:{vesselName:'WL LADOGA'},voyageHeader:{voyageNo:1,voyageStartYear:2026,referenceNo:'WLLADOGA0001001',voyageStatus:{statusTypeCode:'OPR'}},portCalls});

function run(rows){
 const dir=mkdtempSync(join(tmpdir(),'projector-'));
 mkdirSync(join(dir,'data'));mkdirSync(join(dir,'src'));
 writeFileSync(join(dir,'data/operational-voyages.json'),JSON.stringify({fetchedAt:'2026-09-15T09:55:05.500Z',complete:true,reportedTotal:rows.length,count:rows.length,rows}));
 const {status,stdout,stderr}=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
 assert.equal(status,0,`projector exited ${status}: ${stderr}`);
 return {stderr,report:JSON.parse(stdout.trim()),snapshot:JSON.parse(readFileSync(join(dir,'src/operational-snapshot.json'),'utf8'))};
}

test('port call dates are projected from the ARR and DEP event logs the pull already requests',()=>{
 const {report,snapshot}=run([voyage([
  call(1,'KALININGRAD','L',[log('ARR','2026-07-04T06:00:00',true),log('DEP','2026-07-06T11:30:00',true)],{arrivalFixed:true,departureFixed:true}),
  call(2,'SKAW','B',[log('ARR','2026-07-11T02:15:00')]),
  call(3,'CASABLANCA','D',[])
 ])]);
 const ports=snapshot.voyages[0].ports;
 assert.equal(ports[0].arrival,'2026-07-04T06:00:00Z','naive timestamps are stamped UTC');
 assert.equal(ports[0].departure,'2026-07-06T11:30:00Z');
 assert.equal(ports[1].arrival,'2026-07-11T02:15:00Z');
 assert.equal(ports[1].departure,null,'a missing DEP log is null, never the arrival');
 assert.deepEqual([ports[2].arrival,ports[2].departure],[null,null],'no event log means no date');
 assert.deepEqual(report.eventCodes,{ARR:2,DEP:1});
 assert.equal(report.withArrival,2);
 assert.equal(report.withDeparture,1);
});

test('the fixed-date flags keep their previous meaning now that dates ride alongside them',()=>{
 const {snapshot}=run([voyage([
  call(1,'ROTTERDAM','L',[log('ARR','2026-07-04T06:00:00',true)]),
  call(2,'HAMBURG','D',[log('DEP','2026-07-09T06:00:00',false)],{arrivalFixed:true})
 ])]);
 const [a,b]=snapshot.voyages[0].ports;
 assert.equal(a.arrivalFixed,true,'a fixed ARR log alone fixes the arrival');
 assert.equal(a.departureFixed,false);
 assert.equal(b.arrivalFixed,true,'portCall.arrivalFixed alone still fixes the arrival');
 assert.equal(b.departureFixed,false,'an unfixed DEP log carries a date without fixing it');
 assert.equal(b.departure,'2026-07-09T06:00:00Z');
});

test('an unrecognised event code yields no dates and is reported rather than published silently',()=>{
 const {report,stderr}=run([voyage([call(1,'SINGAPORE','B',[log('ATA','2026-07-04T06:00:00'),log('ATD','2026-07-05T06:00:00')])])]);
 assert.match(stderr,/NO_CALL_DATES/,'a silent snapshot of nulls is the failure mode this guards against');
 assert.match(stderr,/ATA, ATD/,'the warning names the codes actually seen');
 assert.equal(report.withArrival,0);
 assert.equal(report.withDeparture,0);
 assert.equal(report.eventLogs,2);
 assert.deepEqual(report.eventCodes,{ATA:1,ATD:1});
});

test('an incomplete or non-Operational pull is still refused',()=>{
 const dir=mkdtempSync(join(tmpdir(),'projector-'));
 mkdirSync(join(dir,'data'));mkdirSync(join(dir,'src'));
 writeFileSync(join(dir,'data/operational-voyages.json'),JSON.stringify({fetchedAt:'x',complete:false,reportedTotal:1,count:1,rows:[voyage([])]}));
 assert.throws(()=>execFileSync(process.execPath,[script],{cwd:dir,stdio:'pipe'}));
 const nonOpr=voyage([]);nonOpr.voyageHeader.voyageStatus.statusTypeCode='EST';
 writeFileSync(join(dir,'data/operational-voyages.json'),JSON.stringify({fetchedAt:'x',complete:true,reportedTotal:1,count:1,rows:[nonOpr]}));
 assert.throws(()=>execFileSync(process.execPath,[script],{cwd:dir,stdio:'pipe'}));
});
