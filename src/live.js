import './fleet.css';
import snapshot from './operational-snapshot.json';
import {dateState,selectVoyages,escapeHtml as esc,snapshotCsv,
        STATE_META,dayDelta,deltaShort,sortVoyages,focusIndex,callStage,counts} from './operational.js';

/* The snapshot carries registered voyage data only - vessel, voyage number,
   reference, OPR status, registered start/end and the ordered port calls with
   their purpose and fixed-date flags. It holds no position, speed, cargo or
   vessel report, so none is shown and a port call is never drawn as a place
   the vessel is. */
const rows=snapshot.voyages, asOf=snapshot.fetchedAt;
const c=counts(rows,asOf);
const overdue=sortVoyages(rows.filter(v=>dateState(v,asOf)==='past'),asOf,'delta');
const worst=overdue.length?dayDelta(overdue[0],asOf):0;

const DATALOY_VOYAGE='https://safeeninvictus.dataloy.com/#/voyages/voyage-drawer/';
const st=v=>STATE_META[dateState(v,asOf)];
const fmtDay=v=>v?new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(v)):null;
const fmtTime=v=>v?new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):null;
const stamp=v=>v?`${fmtDay(v)} ${fmtTime(v)} UTC`:'Not verified';

const icons={ship:'M3 13l9-4 9 4-3 7H6l-3-7z M8 10V4h8v6 M12 4V1',fleet:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',review:'M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',brief:'M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h4',connections:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'M4 12h16 M15 7l5 5-5 5',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',menu:'M3 6h18 M3 12h18 M3 18h18',close:'M5 5l14 14 M19 5L5 19'};
const icon=n=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[n]}"/></svg>`;

const NAV=[['fleet','Voyages','fleet'],['review','Review queue','review'],['brief','Voyage briefing','brief'],['connections','Connections','connections']];
let page=NAV.some(([p])=>p===location.hash.slice(1))?location.hash.slice(1):'fleet';
let search='',filter='all',sort='attention',selected=null,lastFocus=null;

/* Shell. The rail foot carries source state, not a slogan. */
document.querySelector('#app').innerHTML=`<a class="skip" href="#main">Skip to content</a>
<aside class="sidebar"><a class="brand" href="#fleet"><span class="brand-symbol">${icon('ship')}</span><span>Fleet<span class="brand-sub">OPERATIONS</span></span></a>
<div class="nav-label">WORKSPACE</div>
<nav>${NAV.map(([p,label,ic])=>`<button class="nav-item" data-page="${p}">${icon(ic)}<span>${label}</span>${p==='review'&&overdue.length?`<span class="nav-count">${overdue.length}</span>`:''}</button>`).join('')}</nav>
<div class="rail-foot"><span class="lbl">DATA SOURCES</span>
<span class="src">Dataloy<i class="on">read verified</i></span>
<span class="src">Outlook<i class="off">not connected</i></span>
<span class="src">Position<i class="off">none held</i></span>
<span class="src">Snapshot<i class="neutral">${fmtDay(asOf)}</i></span></div></aside>
<div class="shell"><header class="topbar">
<button class="icon-button mobile-menu" id="menu" aria-label="Toggle navigation" aria-expanded="false">${icon('menu')}</button>
<span class="clock">${stamp(asOf)}</span><span class="timezone">all schedules in UTC</span><span class="spacer"></span>
<span class="demo-pill">Manual snapshot &middot; no auto-refresh</span></header>
<main id="main" tabindex="-1"></main>
<footer class="footer"><span>VMwareconnect &middot; Fleet Operations</span><span>Registered voyage data &middot; position and Outlook not connected</span></footer></div>
<div id="drawer-root"></div>`;

const heading=(title,desc,actions='')=>`<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="head-actions">${actions}</div>`:''}</div>`;

/* One band carries the reading and the filters, replacing the tile row and the
   separate tab row. */
function snapbar(){
 const chips=[['all','All voyages',c.all,false],['past',STATE_META.past.short,c.past,true],['within',STATE_META.within.short,c.within,false]]
  .concat(c.future?[['future',STATE_META.future.short,c.future,false]]:[])
  .concat(c.unknown?[['unknown',STATE_META.unknown.short,c.unknown,false]]:[]);
 return `<section class="snapbar" aria-label="Snapshot summary">
 <div class="snap-read"><span class="sentence"><span class="flagged">${c.past}</span> of <b>${c.all}</b> operational voyages are past their registered end date${c.past?`, the furthest by <span class="flagged">${worst} days</span>`:''}. ${c.within} are inside their registered schedule.</span>
 <span class="meta">${c.vessels} vessels &middot; ${c.calls} calls &middot; read ${stamp(asOf)}</span></div>
 <div class="state-filters">${chips.map(([code,label,n,flag])=>`<button class="state-chip${filter===code?' active':''}${flag?' flagged':''}" data-filter="${code}"><span class="mk" aria-hidden="true">${code==='all'?'≡':STATE_META[code].mark}</span>${label}<b>${n}</b></button>`).join('')}</div></section>`;
}

/* Previous, current and next on one line, with the purpose on the call that
   the rotation is pointed at. */
function route(v){
 if(!v.ports||!v.ports.length)return '<span class="route-empty">No port calls</span>';
 const f=focusIndex(v), p=v.ports, bits=[];
 if(f>0)bits.push(`<span class="prev">${esc(p[f-1].name)}</span><span class="sep">›</span>`);
 bits.push(`<span class="cur">${esc(p[f].name)}</span><span class="purpose">${esc(p[f].purpose)}</span>`);
 if(f<p.length-1)bits.push(`<span class="sep">›</span><span class="next">${esc(p[f+1].name)}</span>`);
 return `<span class="route">${bits.join('')}<span class="calls">${p.length} calls</span></span>`;
}

function fleet(){
 return heading('Voyages','Operational voyages as registered in Dataloy, ordered by how far each one sits from its own registered end date.',
  `<button class="button" id="export">${icon('download')}Export CSV</button><button class="button primary" data-page="brief">Voyage briefing</button>`)
 +snapbar()
 +`<section class="position-notice compact"><p><strong>Vessel positions are not connected.</strong> A port call is a scheduled destination, not a position, so nothing is plotted. Verified vessel reports or AIS data will enable a position map.</p><span class="flag unknown"><span class="mk">▨</span>Position unavailable</span></section>
 <section class="panel"><div class="panel-head"><div><h2>Voyage register <span id="result-count">${c.all}</span></h2><p>Registered end dates are not verified arrival times or completion records.</p></div>
 <div class="panel-tools"><label class="search">${icon('search')}<input id="fleet-search" aria-label="Search vessel, voyage, reference or port" placeholder="Vessel, voyage, reference or port" value="${esc(search)}"></label>
 <select id="sort" aria-label="Sort voyages"><option value="attention">Needs attention</option><option value="delta">Days vs end date</option><option value="name">Vessel name</option><option value="end">End date</option></select></div></div>
 <table><thead><tr><th>Vessel / voyage</th><th>Reference</th><th>Port rotation</th><th>Registered window</th><th class="right">Against end</th></tr></thead>
 <tbody id="vessel-rows"></tbody></table>
 <div class="panel-foot"><span id="result-footer"></span><span>OPR is a workflow status, not a sailing status</span></div></section>`;
}

function renderRows(){
 const list=sortVoyages(selectVoyages(rows,{search,state:filter,asOf}),asOf,sort);
 document.querySelector('#vessel-rows').innerHTML=list.length?list.map(v=>{
  const code=dateState(v,asOf), s=STATE_META[code], d=deltaShort(v,asOf);
  const flagClass=code==='past'?'past':code==='unknown'?'unknown':'';
  return `<tr class="${flagClass}">
  <td><button class="v-cell" data-voyage="${v.id}"><span class="mk" title="${s.label}"><span class="sr-only">${s.label}. </span><span aria-hidden="true">${s.mark}</span></span><span><strong>${esc(v.name)}</strong><small>${esc(v.voyage)} &middot; OPR</small></span></button></td>
  <td data-label="Reference"><a class="ref-link" href="${DATALOY_VOYAGE}${encodeURIComponent(v.dataloyId)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(v.reference)} in Dataloy VMS">${esc(v.reference)}${icon('arrow')}</a></td>
  <td data-label="Port rotation">${route(v)}</td>
  <td data-label="Registered window"><span class="window"><span><i>start</i>${fmtDay(v.start)||'Not verified'}<b>${fmtTime(v.start)||''}</b></span><span><i>end</i>${fmtDay(v.end)||'Not verified'}<b>${fmtTime(v.end)||''}</b></span></span></td>
  <td class="cell-delta"><span class="delta ${d.tone}" title="${d.title}"><b>${d.text}</b><small>vs end date</small></span></td>
  <td class="cell-flag" data-label="Schedule review"><span class="flag ${flagClass}"><span class="mk" aria-hidden="true">${s.mark}</span>${s.label}</span></td></tr>`;
 }).join(''):`<tr><td colspan="6"><div class="empty-state"><strong>No voyages found</strong><p>Try another vessel, reference or port.</p><button class="button" id="clear">Clear search and filter</button></div></td></tr>`;
 document.querySelector('#result-count').textContent=list.length;
 document.querySelector('#result-footer').textContent=`Showing ${list.length} of ${c.all} voyages`;
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
}

/* Ranked by magnitude, so the worst case leads instead of whichever name
   sorts first. */
function review(){
 const least=overdue.length?dayDelta(overdue[overdue.length-1],asOf):0;
 return heading('Review queue','Voyages that remain Operational after their registered end date, ranked by how far past that date they sit.')
 +`<p class="review-lede">${overdue.length} of ${c.all} voyages need a status review, from ${worst} days past down to ${least}. None of these is a confirmed delay: each is equally consistent with a voyage that finished and was never closed, or a registered date that was never revised. Compare vessel reports before drawing a conclusion. Every measurement is against the snapshot instant, ${stamp(asOf)}.</p>
 <section class="rank">${overdue.map((v,i)=>{const d=dayDelta(v,asOf),f=focusIndex(v),p=v.ports[f];return `<button class="rank-row" data-voyage="${v.id}">
 <span class="n">${String(i+1).padStart(2,'0')}</span>
 <span><span class="v">${esc(v.name)}</span><span class="sub">${esc(v.voyage)} &middot; ${esc(v.reference)}</span></span>
 <span class="m">Registered end <span class="num">${stamp(v.end)}</span><br>${p?`${esc(p.name)} &middot; ${esc(p.purpose)}`:'No port calls'} &middot; ${v.ports.length} calls</span>
 <span class="d"><b>${d}</b><small>days past</small></span>
 <span class="bar" aria-hidden="true"><i style="width:${worst?Math.max(2,Math.round(d/worst*100)):0}%"></i></span></button>`;}).join('')}</section>`;
}

function briefText(){
 return `FLEET OPERATIONS - DATALOY VOYAGE BRIEFING\nSnapshot ${stamp(asOf)}\nRegistered voyage data only. No vessel position, no report reconciliation.\n\n`
 +`${c.all} voyages / ${c.vessels} vessels / ${c.calls} port calls\n${c.past} past the registered end date / ${c.within} within schedule\n\n`
 +`PAST THE REGISTERED END DATE, RANKED\n`
 +overdue.map(v=>`${String(dayDelta(v,asOf)).padStart(4)}d  ${v.name} | ${v.voyage} | ${v.reference} | end ${v.end}`).join('\n')
 +`\n\nALL VOYAGES\n`
 +sortVoyages(rows,asOf,'name').map(v=>`${v.name} | ${v.voyage} | ${(v.ports||[]).map(p=>p.name).join(' > ')} | ${v.start} -> ${v.end} | ${st(v).label}`).join('\n');
}

function briefing(){
 const top=overdue.slice(0,8);
 return heading('Voyage briefing','A fixed reading of the latest snapshot.',`<button class="button primary" id="brief-download">${icon('download')}Download briefing</button>`)
 +`<article class="brief-paper"><div class="brief-top"><span>Dataloy voyage briefing</span><span>${stamp(asOf)}</span></div>
 <h2>${c.past} of ${c.all} voyages sit past their registered end date.</h2>
 <p class="brief-lead">${c.vessels} vessels carry ${c.all} operational voyages across ${c.calls} registered port calls. ${c.within} are inside their registered schedule. None of this establishes whether a vessel is sailing - that needs a vessel report, and Outlook is not connected.</p>
 <h3>Furthest past the registered end date</h3><div class="brief-rows">${top.map(v=>`<button class="brief-row" data-voyage="${v.id}"><strong>${esc(v.name)}</strong><span class="m">${dayDelta(v,asOf)}d past</span><span class="why">${esc(v.voyage)} &middot; ${esc(v.reference)} &middot; registered end ${stamp(v.end)}</span></button>`).join('')}</div>
 ${overdue.length>top.length?`<p class="subtle-note" style="margin-top:11px">${overdue.length-top.length} further voyages are past their registered end date - see the review queue.</p>`:''}
 <h3>What this briefing cannot tell you</h3><div class="brief-rows">
 <div class="brief-row"><strong>Where any vessel is</strong><span class="m">no position</span><span class="why">Port calls are registered destinations. Nothing here is a position.</span></div>
 <div class="brief-row"><strong>Whether a voyage actually ran late</strong><span class="m">no reconciliation</span><span class="why">Noon, port and working reports are not collected, so a passed end date carries no explanation.</span></div>
 <div class="brief-row"><strong>Anything newer than the snapshot</strong><span class="m">no refresh</span><span class="why">This page is a single read taken at ${stamp(asOf)}.</span></div></div>
 <div class="brief-note">Built from a deterministic template over the published snapshot. Registered dates are <span class="num">voyageStartDateGMT</span> and <span class="num">voyageEndDateGMT</span>; they are not destination ETAs and not actual completion times.</div></article>`;
}

function connections(){
 return heading('Connections','What is verified, what is published, and what is still missing.')
 +`<div class="connection-grid">
 <article class="connection-card"><span class="connection-label">DATALOY</span><h2>Voyage snapshot available</h2><span class="flag ok"><span class="mk">✓</span>Read access verified</span>
 <p>All ${c.all} voyages were retrieved across every page. This workspace publishes approved vessel names, voyage references, port rotations with their purpose, and registered schedules.</p>
 <ul><li class="done">OAuth token exchange</li><li class="done">Operational voyage read &middot; all pages</li><li class="done">Snapshot ${stamp(asOf)}</li><li>Automatic refresh</li><li>Field semantics verified against business cases</li></ul></article>
 <article class="connection-card"><span class="connection-label">OUTLOOK</span><h2>Vessel reports pending</h2><span class="flag past"><span class="mk">■</span>Not connected</span>
 <p>Outlook screen access through VMware Horizon is verified. Automated noon, port and working report collection - and the reconciliation this product exists to perform - are still pending.</p>
 <ul><li class="done">Horizon screen access</li><li>Graph or COM collection path</li><li>Authenticated upload from the VM</li><li>Report parsing with per-field evidence</li><li>Reconciliation against these registered dates</li></ul></article>
 <article class="connection-card"><span class="connection-label">POSITION</span><h2>Positions pending</h2><span class="flag unknown"><span class="mk">▨</span>Awaiting verified positions</span>
 <p>Port calls are scheduled destinations, not current vessel positions. A map returns when a position carries a verified source and observation time.</p>
 <ul><li>Verified position from a vessel report</li><li>Or a licensed AIS feed</li><li>Observation time and source on every point</li></ul></article></div>
 <section class="position-notice" style="margin-top:14px"><div><strong>Credentials never reach this page</strong><p>The Dataloy key and token live only in a server-side runtime secret. This is a static build: it carries a published extract, makes no API call and accepts no key.</p></div><span class="flag ok"><span class="mk">✓</span>static &middot; no secrets</span></section>`;
}

function render(){
 document.querySelector('#main').innerHTML=page==='fleet'?fleet():page==='review'?review():page==='brief'?briefing():connections();
 document.title=`${NAV.find(n=>n[0]===page)[1]} · Fleet Operations`;
 document.querySelectorAll('.nav-item').forEach(b=>{const on=b.dataset.page===page;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');});
 if(page==='fleet'){renderRows();document.querySelector('#sort').value=sort;}
 document.querySelector('.sidebar').classList.remove('open');
 document.querySelector('#menu').setAttribute('aria-expanded','false');
}
function navigate(p){if(!NAV.some(n=>n[0]===p))return;close();page=p;location.hash=p;render();window.scrollTo(0,0);}

function open(id){
 const v=rows.find(x=>x.id===id);if(!v)return;
 selected=v;lastFocus=document.activeElement;
 const code=dateState(v,asOf), s=STATE_META[code], d=deltaShort(v,asOf), f=focusIndex(v);
 const flagClass=code==='past'?'past':code==='unknown'?'unknown':'';
 document.querySelector('#drawer-root').innerHTML=`<div class="drawer-backdrop" id="backdrop"></div>
 <section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
 <div class="drawer-top"><span class="lbl">DATALOY VOYAGE</span><button class="icon-button" id="close" aria-label="Close voyage details">${icon('close')}</button></div>
 <div class="drawer-title"><h2 id="drawer-title">${esc(v.name)}</h2>
 <p>Voyage ${esc(v.voyage)} <a class="ref-link" href="${DATALOY_VOYAGE}${encodeURIComponent(v.dataloyId)}" target="_blank" rel="noopener noreferrer">${esc(v.reference)}${icon('arrow')}</a> <span class="opr">OPR</span></p></div>
 <div class="drawer-content">
 <span class="flag ${flagClass}"><span class="mk">${s.mark}</span>${s.label}</span>
 <div class="detail-grid">
 <div><small>Registered start &middot; UTC</small><strong>${stamp(v.start)}</strong><span>voyageStartDateGMT</span></div>
 <div><small>Registered end &middot; UTC</small><strong>${stamp(v.end)}</strong><span>Not a verified completion time</span></div>
 <div><small>Against end date</small><strong>${d.text}</strong><span>measured at the snapshot instant</span></div>
 <div><small>Registered calls</small><strong>${v.ports.length}</strong><span>portCallSequence order</span></div>
 <div><small>Vessel position</small><strong>Not verified</strong><span>No verified position feed</span></div>
 <div><small>Report reconciliation</small><strong>Not performed</strong><span>Outlook collection not connected</span></div></div>
 <h3 class="ports-heading">Registered port rotation</h3>
 <ol class="port-sequence">${v.ports.map((p,i)=>`<li class="stage-${callStage(p)}${i===f?' focus':''}"><span class="i">${String(i+1).padStart(2,'0')}</span><span class="nm">${esc(p.name)}</span><span class="st">${esc(p.purpose)} &middot; ${p.departureFixed?'Completed call':p.arrivalFixed?'In port':'Scheduled'}</span></li>`).join('')||'<li><span class="i">-</span><span class="nm">No port calls recorded</span><span class="st"></span></li>'}</ol>
 <p class="subtle-note">“Current schedule” means the first port call without a fixed departure in Dataloy. It does not claim the vessel is physically at that port. Position confirmation and Outlook report reconciliation are pending.</p>
 </div><div class="drawer-footer">Snapshot &middot; ${stamp(asOf)}</div></section>`;
 document.body.classList.add('drawer-open');
 document.querySelector('.shell').inert=true;document.querySelector('.sidebar').inert=true;
 document.querySelector('#close').focus();
}
function close(){
 if(!selected)return;
 document.querySelector('#drawer-root').innerHTML='';
 document.body.classList.remove('drawer-open');
 document.querySelector('.shell').inert=false;document.querySelector('.sidebar').inert=false;
 selected=null;lastFocus?.focus();
}
function download(name,text,type){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}

document.addEventListener('click',e=>{
 if(e.target.id==='backdrop')return close();
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.page)return navigate(b.dataset.page);
 if(b.dataset.voyage)return open(b.dataset.voyage);
 if(b.dataset.filter){filter=b.dataset.filter;renderRows();return;}
 if(b.id==='menu'){const on=document.querySelector('.sidebar').classList.toggle('open');b.setAttribute('aria-expanded',String(on));}
 if(b.id==='close')close();
 if(b.id==='clear'){search='';filter='all';document.querySelector('#fleet-search').value='';renderRows();}
 if(b.id==='export')download('dataloy-operational-snapshot.csv',snapshotCsv(sortVoyages(selectVoyages(rows,{search,state:filter,asOf}),asOf,sort),asOf),'text/csv;charset=utf-8');
 if(b.id==='brief-download')download('dataloy-voyage-briefing.txt',briefText(),'text/plain;charset=utf-8');
});
document.addEventListener('input',e=>{if(e.target.id==='fleet-search'){search=e.target.value;renderRows();}});
document.addEventListener('change',e=>{if(e.target.id==='sort'){sort=e.target.value;renderRows();}});
document.addEventListener('keydown',e=>{if(!selected)return;if(e.key==='Escape')return close();if(e.key==='Tab'){e.preventDefault();document.querySelector('#close').focus();}});
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(p==='main'){document.querySelector('#main').focus();return;}if(NAV.some(n=>n[0]===p)&&p!==page){close();page=p;render();}});
render();
