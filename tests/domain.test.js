import test from 'node:test';
import assert from 'node:assert/strict';
import {vessels,ageHours,etaDelta,filterVessels,coordinates,csvExport} from '../src/data.js';
test('ETA is signed and missing data is never zero',()=>{assert.equal(etaDelta(vessels[0]),14);assert.equal(etaDelta(vessels[5]),-2);assert.equal(etaDelta(vessels[7]),null);});
test('stale position stays stale against the visible fixed snapshot',()=>{assert.equal(ageHours(vessels[4]),34);assert.equal(ageHours(vessels[7]),null);});
test('search, status and issue filters compose',()=>{assert.equal(filterVessels(vessels,{search:'singapore',status:'At sea'}).length,1);assert.equal(filterVessels(vessels,{issueOnly:true}).length,4);assert.equal(filterVessels(vessels,{search:'zzzz'}).length,0);});
test('unknown positions are kept out of coordinates, not mapped to zero',()=>{assert.equal(coordinates(null),'Position unknown');assert.equal(coordinates([0,0]),'0.00°N  0.00°E');});
test('CSV labels demo data and escapes values',()=>{const csv=csvExport([{...vessels[0],name:'DEMO "A", B'}]);assert.match(csv,/NOT LIVE OPERATIONS/);assert.match(csv,/"DEMO ""A"", B"/);});
