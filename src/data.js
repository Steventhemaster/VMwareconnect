// All records in this module are fictional. Never replace these with real mailbox data.
export const AS_OF = '2026-09-14T08:00:00Z';

// UN/LOCODE for every port named in this dataset. Operators read the code, not the name.
export const LOCODE = {Fujairah:'AEFJR',Singapore:'SGSIN',Sohar:'OMSOH',Mumbai:'INBOM','Port Klang':'MYPKG',Colombo:'LKCMB',Salalah:'OMSLL',Mombasa:'KEMBA',Mundra:'INMUN',Chittagong:'BDCGP'};
export const locode = name => LOCODE[name] || '—';

// severity code -> display label, sort rank and the shape token that carries it
// when colour is unavailable. Severity is never encoded in colour alone.
export const SEVERITY = {
  critical:{label:'Priority',rank:0,mark:'■'},
  warn:{label:'Review',rank:1,mark:'▲'},
  unknown:{label:'On hold',rank:2,mark:'▨'},
  ok:{label:'Aligned',rank:3,mark:'·'},
};

// statusCode is the stable key (filters, styling); status is the label shown on screen.
export const STATUS = [
  {code:'all',label:'All vessels'},
  {code:'sea',label:'At sea'},
  {code:'alongside',label:'Alongside'},
  {code:'anchor',label:'At anchor'},
  {code:'check',label:'Needs check'},
];

export const vessels = [
  {id:'v1',name:'PACIFIC GLORY',short:'PG',voyage:'2026-014',type:'Supramax',statusCode:'sea',status:'At sea',activity:'Laden passage',position:[67.8,15.2],course:110,reportedAt:'2026-09-14T06:00:00Z',from:'Fujairah',to:'Singapore',eta:'2026-09-19T08:00:00Z',planEta:'2026-09-18T18:00:00Z',speed:12.4,cargo:'Clinker',quantity:'52,000 MT',rob:421.3,issue:'ETA gap',severity:'warn',track:[[57.3,24.8],[60.5,21.6],[64.1,18.4],[67.8,15.2]],reason:'The noon report carries an updated ETA for the next port. It sits 14 hours later than the Dataloy forecast.',action:'The vessel ETA is 14 hours later than the plan.',discrepancy:{field:'ETA · next port',reported:'19 Sep 08:00 UTC',dataloy:'18 Sep 18:00 UTC',delta:'+14h'}},
  {id:'v2',name:'OCEAN MERIDIAN',short:'OM',voyage:'2026-021',type:'Ultramax',statusCode:'alongside',status:'Alongside',activity:'Discharging',position:[72.9,18.9],course:180,reportedAt:'2026-09-14T05:30:00Z',from:'Sohar',to:'Mumbai',eta:'2026-09-13T04:00:00Z',planEta:'2026-09-13T04:00:00Z',speed:0,cargo:'Limestone',quantity:'58,500 MT',rob:308.6,issue:'Berthing not recorded',severity:'critical',progress:62,track:[[57.2,24.5],[64.1,21.5],[70.3,19.7],[72.9,18.9]],reason:'The vessel reported All Fast, but the same port call in Dataloy holds no berthing actual. Berthing is a separate event from arrival.',action:'Compare the All Fast report against the Dataloy actual.',discrepancy:{field:'All Fast',reported:'13 Sep 06:10 UTC',dataloy:'No berthing actual',delta:'not recorded'}},
  {id:'v3',name:'ATLAS VOYAGER',short:'AV',voyage:'2026-008',type:'Handysize',statusCode:'sea',status:'At sea',activity:'Ballast passage',position:[81.7,7.8],course:290,reportedAt:'2026-09-14T04:00:00Z',from:'Port Klang',to:'Colombo',eta:'2026-09-15T13:00:00Z',planEta:'2026-09-15T12:00:00Z',speed:11.8,cargo:'Ballast',quantity:'—',rob:267.1,issue:null,severity:'ok',track:[[101.3,2.9],[95.4,4.1],[89.3,5.4],[81.7,7.8]],reason:'The latest vessel report and the Dataloy port call plan agree within tolerance.'},
  {id:'v4',name:'CORAL HORIZON',short:'CH',voyage:'2026-017',type:'Supramax',statusCode:'anchor',status:'At anchor',activity:'Anchored',position:[56.7,25.2],course:20,reportedAt:'2026-09-14T07:00:00Z',from:'Salalah',to:'Fujairah',eta:'2026-09-14T16:00:00Z',planEta:'2026-09-14T16:00:00Z',speed:0,cargo:'GGBFS',quantity:'48,000 MT',rob:392.5,issue:null,severity:'ok',track:[[54.1,18.8],[57.5,21.4],[56.7,25.2]],reason:'Built from the latest anchoring report. Whether the vessel is waiting for a berth has not been established.'},
  {id:'v5',name:'INDIGO STAR',short:'IS',voyage:'2026-032',type:'Ultramax',statusCode:'sea',status:'At sea',activity:'Laden passage',position:[93.2,5.9],course:115,reportedAt:'2026-09-12T22:00:00Z',from:'Colombo',to:'Port Klang',eta:'2026-09-16T09:00:00Z',planEta:'2026-09-16T06:00:00Z',speed:12.1,cargo:'Coal',quantity:'61,000 MT',rob:350.8,issue:'Late report',severity:'warn',track:[[80.2,6.9],[85.9,5.5],[93.2,5.9]],reason:'The last position report is 34 hours old. The map shows where the vessel reported then, not where it is now.',action:'The last position report is 34 hours old.',discrepancy:{field:'Last position report',reported:'12 Sep 22:00 UTC',dataloy:'No later report',delta:'34h old'}},
  {id:'v6',name:'SILVER TIDE',short:'ST',voyage:'2026-011',type:'Handysize',statusCode:'sea',status:'At sea',activity:'Laden passage',position:[64.8,-3.2],course:40,reportedAt:'2026-09-14T06:30:00Z',from:'Mombasa',to:'Mundra',eta:'2026-09-20T10:00:00Z',planEta:'2026-09-20T12:00:00Z',speed:11.5,cargo:'Gypsum',quantity:'34,000 MT',rob:241.2,issue:null,severity:'ok',track:[[40.1,-4.1],[49.2,-6.3],[57.2,-5.4],[64.8,-3.2]],reason:'Position and the vessel ETA for the next port call both come from a validated synthetic report.'},
  {id:'v7',name:'EASTERN SOLACE',short:'ES',voyage:'2026-019',type:'Supramax',statusCode:'alongside',status:'Alongside',activity:'Loading',position:[103.7,1.2],course:90,reportedAt:'2026-09-14T03:00:00Z',from:'Singapore',to:'Chittagong',eta:'2026-09-18T14:00:00Z',planEta:'2026-09-18T14:00:00Z',speed:0,cargo:'Steel products',quantity:'45,200 MT',rob:410.0,issue:null,severity:'ok',progress:38,track:[[100.1,4.1],[102.1,2.2],[103.7,1.2]],reason:'Progress is taken from the cumulative loaded quantity in the working report.'},
  {id:'v8',name:'NORTHWIND',short:'NW',voyage:'2026-027',type:'Ultramax',statusCode:'check',status:'Needs check',activity:'Position unknown',position:null,course:0,reportedAt:null,from:'Mundra',to:'Sohar',eta:null,planEta:'2026-09-17T08:00:00Z',speed:null,cargo:'Not available',quantity:'—',rob:null,issue:'Collection link unverified',severity:'unknown',track:[],reason:'Collection coverage for this vessel is unverified, so no missing-report finding is raised. No position is estimated or plotted.',action:'Collection coverage is unverified, so no finding is raised.',discrepancy:{field:'Report collection',reported:'Coverage unverified',dataloy:'Finding withheld',delta:'no position'}},
];

export const ports = [
  {name:'FUJAIRAH',code:'AEFJR',position:[56.4,25.1]},
  {name:'MUMBAI',code:'INBOM',position:[72.8,18.9]},
  {name:'COLOMBO',code:'LKCMB',position:[79.8,6.9]},
  {name:'SINGAPORE',code:'SGSIN',position:[103.8,1.3]},
  {name:'MOMBASA',code:'KEMBA',position:[39.7,-4.1]},
];

export function ageHours(v, asOf=AS_OF){return v.reportedAt ? Math.max(0,(Date.parse(asOf)-Date.parse(v.reportedAt))/3600000):null;}
export function etaDelta(v){return v.eta&&v.planEta?(Date.parse(v.eta)-Date.parse(v.planEta))/3600000:null;}
export function filterVessels(list,{search='',status='all',issueOnly=false}={}){const q=search.trim().toLowerCase();return list.filter(v=>(!q||[v.name,v.voyage,v.to,v.from,v.short,locode(v.from),locode(v.to)].some(x=>String(x).toLowerCase().includes(q)))&&(status==='all'||v.statusCode===status)&&(!issueOnly||v.severity!=='ok'));}
export function coordinates(position){if(!position)return 'Position unknown';const [lng,lat]=position;return `${Math.abs(lat).toFixed(2)}°${lat>=0?'N':'S'}  ${Math.abs(lng).toFixed(2)}°${lng>=0?'E':'W'}`;}
// Degrees and decimal minutes, the notation a deck officer writes in the log.
export function coordinatesDM(position){if(!position)return 'Position unknown';const dm=(value,pad,pos,neg)=>{const a=Math.abs(value),d=Math.floor(a),m=((a-d)*60).toFixed(1);return `${String(d).padStart(pad,'0')}°${m.padStart(4,'0')}'${value>=0?pos:neg}`;};const [lng,lat]=position;return `${dm(lat,2,'N','S')}  ${dm(lng,3,'E','W')}`;}
// Counts are derived from the list so they cannot drift from the data.
export function fleetCounts(list=vessels){const by=k=>list.reduce((n,v)=>n+(v[k[0]]===k[1]?1:0),0);return{total:list.length,sea:by(['statusCode','sea']),alongside:by(['statusCode','alongside']),anchor:by(['statusCode','anchor']),check:by(['statusCode','check']),critical:by(['severity','critical']),warn:by(['severity','warn']),unknown:by(['severity','unknown']),ok:by(['severity','ok']),plotted:list.filter(v=>v.position).length,review:list.filter(v=>v.severity==='warn'||v.severity==='critical').length};}
export function csvExport(list){const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';return '﻿'+[['DEMO DATA — NOT LIVE OPERATIONS'],['Vessel','Voyage','Status','Destination','Destination LOCODE','Report UTC','Latitude','Longitude','Vessel ETA UTC','Dataloy ETA UTC'],...list.map(v=>[v.name,v.voyage,v.status,v.to,locode(v.to),v.reportedAt,v.position?.[1],v.position?.[0],v.eta,v.planEta])].map(row=>row.map(cell).join(',')).join('\r\n');}
