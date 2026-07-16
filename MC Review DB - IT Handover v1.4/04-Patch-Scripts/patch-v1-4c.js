/* MC Review Dashboard — atomic patch: round-1 E2E audit fixes (14 confirmed findings)
 * F1 select-all vacuous-checked · F2 stale .err on NFA strip · F3 P2 sheet-date past-limit
 * F4/F5/F10 index-aware registry + PDF resolution · F6 UNDECIDED style · F7 order-number
 * collision + permanent retired ledger · F8 draft re-pull published-target guard
 * F9 refreshQMS em-dash guard · F11 hostile-filename-safe file chips + esc(') · F12 ticket-cancel
 * staged-upload salvage · F13 role-switch closes modals + executor guards · F14 partial-search registry scan
 * Applies in place on mc-review-dashboard-prototype-v1-4.html. Match-count asserted, all-or-nothing.
 */
const fs = require('fs');
const FILE = 'mc-review-dashboard-prototype-v1-4.html';
let html = fs.readFileSync(FILE, 'utf8');
let applied = 0;
function repN(name, from, to, n){
  const parts = html.split(from);
  if(parts.length !== n+1) throw new Error('PATCH FAIL ['+name+'] — expected '+n+' match(es), found '+(parts.length-1));
  html = parts.join(to);
  applied++;
  console.log('OK  '+name);
}
const rep = (name, from, to) => repN(name, from, to, 1);

/* F1 — select-all header only checked when at least one row is selectable */
rep('F1 select-all vacuous-checked',
`(rows.length&&rows.every(e=>!(editableEntry(e)||e.pmv)||e.sel)?'checked':'')`,
`(rows.some(e=>editableEntry(e)||e.pmv)&&rows.every(e=>!(editableEntry(e)||e.pmv)||e.sel)?'checked':'')`);

/* F2 — NFA strip validation outline self-corrects */
rep('F2a qeNfa err toggle',
`    if(!nfa){ document.getElementById('qeNfa').classList.add('err'); bad=true; }`,
`    document.getElementById('qeNfa').classList.toggle('err', !nfa); if(!nfa) bad=true;`);
rep('F2b qeNfa oninput clears err',
`<input class="inp" id="qeNfa" style="width:132px" placeholder="e.g. 14333" value="'`,
`<input class="inp" id="qeNfa" style="width:132px" placeholder="e.g. 14333" oninput="this.classList.remove(\\'err\\')" value="'`);

/* F3 — P2 sheet-date calendar limited to today+future like its P3 sibling */
rep('F3 LIM s2 min',
`const LIM={p1:{min:TODAY},qe:{min:TODAY},mb:{min:TODAY},s3:{min:TODAY},mig:{min:TODAY,max:addDays(TODAY,10)}};`,
`const LIM={p1:{min:TODAY},qe:{min:TODAY},mb:{min:TODAY},s2:{min:TODAY},s3:{min:TODAY},mig:{min:TODAY,max:addDays(TODAY,10)}};`);

/* F4/F5 — registry entries carry their publishing index */
rep('F4a seed registry indices',
`const registry = {
 '13594':[{date:'01-May-2026',o:'HOLD'}],
 '14313':[{date:'29-Jun-2026',o:'APPROVED'}],
 '14344':[{date:'29-Jun-2026',o:'APPROVED'}]
};`,
`const registry = {
 '13594':[{date:'01-May-2026',index:'MEP',o:'HOLD'}],
 '14313':[{date:'29-Jun-2026',index:'MEP',o:'APPROVED'}],
 '14344':[{date:'29-Jun-2026',index:'MEP',o:'APPROVED'}]
};`);
rep('F4b doPublish decided push index',
`(registry[r.nfa]=registry[r.nfa]||[]).push({date,o:s.dec[r.id].s});`,
`(registry[r.nfa]=registry[r.nfa]||[]).push({date,index:idx,o:s.dec[r.id].s});`);
rep('F4c doPublish undecided push index',
`(registry[r.nfa]=registry[r.nfa]||[]).push({date,o:'UNDECIDED'});`,
`(registry[r.nfa]=registry[r.nfa]||[]).push({date,index:idx,o:'UNDECIDED'});`);

/* F10 — openPdfFor resolves by index + date */
rep('F10 openPdfFor index-aware',
`  openPdfFor(nfa){ const r=registry[nfa]; if(!r) return; const last=r[r.length-1]; const p=state.published.find(x=>x.date===last.date); if(p) App.openPdf(p.id); else toast('PDF of '+last.date+' (seeded reference)'); },`,
`  openPdfFor(nfa){ const r=registry[nfa]; if(!r) return; const last=r[r.length-1]; const p=state.published.find(x=>x.date===last.date && (!last.index || x.index===last.index)); if(p) App.openPdf(p.id); else toast('PDF of '+last.date+' (seeded reference)'); },`);

/* F14 — NFA search scans registry keys by substring like it does entries */
rep('F14a registry substring scan',
`  const ents=state.entries.filter(e=>e.nfa.toLowerCase().includes(q.toLowerCase()));
  const reg=registry[q]||[];`,
`  const ents=state.entries.filter(e=>e.nfa.toLowerCase().includes(q.toLowerCase()));
  const reg=Object.keys(registry).filter(k=>k.toLowerCase().includes(q.toLowerCase())).flatMap(k=>registry[k].map(r=>({...r,nfa:k})));`);

/* F5/F6/F14 — history rows: real NFA + real index + neutral UNDECIDED style + index-matched PDF */
rep('F5 history row renderer',
`  reg.forEach(r=>{ const p=state.published.find(pp=>pp.date===r.date); out+='<tr><td class="nfa">'+esc(q)+'</td><td>'+r.date+'</td><td>MEP</td><td class="st grey">(historical sitting)</td><td>—</td><td><span class="st '+(r.o==='APPROVED'?'ok':r.o==='HOLD'?'hold':'rej')+'">'+r.o+'</span></td><td>—</td><td>'+(p?'<button class="btn sm ghost" onclick="App.openPdf('+p.id+')">Open ↓</button>':'—')+'</td></tr>'; });`,
`  reg.forEach(r=>{ const p=state.published.find(pp=>pp.date===r.date && (!r.index || pp.index===r.index)); out+='<tr><td class="nfa">'+esc(r.nfa)+'</td><td>'+r.date+'</td><td>'+esc(r.index||'MEP')+'</td><td class="st grey">(historical sitting)</td><td>—</td><td><span class="st '+(r.o==='APPROVED'?'ok':r.o==='HOLD'?'hold':r.o==='UNDECIDED'?'pend':'rej')+'">'+r.o+'</span></td><td>—</td><td>'+(p?'<button class="btn sm ghost" onclick="App.openPdf('+p.id+')">Open ↓</button>':'—')+'</td></tr>'; });`);

/* F7 — permanent retired ledger; generate skips claimed/retired slots; override refuses retired */
rep('F7a state.retired ledger',
`  entries:[], sheets:{}, published:[], audit:[], searchQ:''`,
`  entries:[], sheets:{}, published:[], retired:[], audit:[], searchQ:''`);
rep('F7b genOrders skip taken/retired',
`    const key='ord'+e.index; for(let i=0;i<n;i++){ const no='ORD/'+(e.index==='MEP'?'MEP':'CIV')+'/0726-'+String(++seq[key]).padStart(4,'0'); e.orders.push({no,vendor:'',type:'PO',by:userName(),at:TODAY.slice(0,6)+' '+nowT(),ov:false}); }`,
`    const key='ord'+e.index; const taken=new Set(state.retired); state.entries.forEach(x=>x.orders.forEach(o=>taken.add(o.no)));
    for(let i=0;i<n;i++){ let no; do{ no='ORD/'+(e.index==='MEP'?'MEP':'CIV')+'/0726-'+String(++seq[key]).padStart(4,'0'); }while(taken.has(no)); taken.add(no); e.orders.push({no,vendor:'',type:'PO',by:userName(),at:TODAY.slice(0,6)+' '+nowT(),ov:false}); }`);
rep('F7c overrideNo refuses retired',
`    const clash=state.entries.some(x=>x.orders.some((o,j)=>o.no===v && !(x.id===id&&j===i)));
    if(clash){ toast('Order number must be unique — <b>'+esc(v)+'</b> already exists','err'); render(); return; }`,
`    const clash=state.entries.some(x=>x.orders.some((o,j)=>o.no===v && !(x.id===id&&j===i)));
    if(clash){ toast('Order number must be unique — <b>'+esc(v)+'</b> already exists','err'); render(); return; }
    if(state.retired.includes(v)){ toast('Order number <b>'+esc(v)+'</b> was deleted earlier — <b>retired, permanently unavailable</b> (never re-issued)','err'); render(); return; }`);
rep('F7d doDelOrder records ledger',
`  doDelOrder(id,i){ const e=state.entries.find(x=>x.id===id); const o=e.orders.splice(i,1)[0]; audit('Order number deleted', o.no+' ('+e.nfa+')');`,
`  doDelOrder(id,i){ const e=state.entries.find(x=>x.id===id); const o=e.orders.splice(i,1)[0]; state.retired.push(o.no); audit('Order number deleted', o.no+' ('+e.nfa+') · retired to permanent ledger');`);

/* F8 — draft re-pull with differing values refuses a published target date */
rep('F8 draft differing published-target guard',
`      if(differs){ open.index=idx; open.wt=wt; open.date=date; audit('Draft re-pull with new strip values', nfa+' → '+shortRef(idx,date)); }`,
`      if(differs){ if(sheet(idx,date).publishedRev){ toast('Blocked — target '+IDX[idx]+' · '+date+' is <b>published; the date is closed</b>. Pick another review date.','err'); return; } open.index=idx; open.wt=wt; open.date=date; audit('Draft re-pull with new strip values', nfa+' → '+shortRef(idx,date)); }`);

/* F9 — refreshQMS guards the em-dash reasonability like its siblings */
rep('F9 refreshQMS em-dash guard',
`e.hyb.remarks.qms='Value ₹'+q.val+' L. '+q.reasonability;`,
`e.hyb.remarks.qms='Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability);`);

/* F11 — esc() covers single quotes; file chips stop interpolating filenames into inline JS */
rep('F11a esc single quotes',
`const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');`,
`const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');`);
rep('F11b fileChips data attributes',
`function fileChips(files, opts){ opts=opts||{}; if(!files||!files.length) return '<span class="st grey">—</span>';
  return '<div class="fchips">'+files.map((f,i)=>'<span class="fchip" onclick="App.openFile(\\''+esc(f.n)+'\\',\\''+f.t+'\\')" title="'+esc(f.n)+'"><span class="ft '+ftClass(f.t)+'">'+ftLabel(f.t)+'</span><span class="fn">'+esc(f.n)+'</span>'+(opts.removable?'<button class="fx" title="Deselect file" onclick="event.stopPropagation();App.removeFile('+opts.eid+','+i+')">×</button>':'')+'</span>').join('')+'</div>'; }`,
`function fileChips(files, opts){ opts=opts||{}; if(!files||!files.length) return '<span class="st grey">—</span>';
  return '<div class="fchips">'+files.map((f,i)=>'<span class="fchip" data-fn="'+esc(f.n)+'" data-ft="'+esc(f.t)+'" title="'+esc(f.n)+'"><span class="ft '+ftClass(f.t)+'">'+ftLabel(f.t)+'</span><span class="fn">'+esc(f.n)+'</span>'+(opts.removable?'<button class="fx" title="Deselect file" data-eid="'+opts.eid+'" data-i="'+i+'">×</button>':'')+'</span>').join('')+'</div>'; }`);
rep('F11c delegated chip listener',
`document.addEventListener('mousedown', e=>{ if(Cal.o && !e.target.closest('#calHost') && !e.target.closest('.calbtn')) Cal.close(); });`,
`document.addEventListener('mousedown', e=>{ if(Cal.o && !e.target.closest('#calHost') && !e.target.closest('.calbtn')) Cal.close(); });
/* delegated file-chip handling — filenames are never interpolated into inline JS (hostile-name safe) */
document.addEventListener('click', ev=>{
  const fx=ev.target.closest('.fchip .fx');
  if(fx){ ev.stopPropagation(); App.removeFile(+fx.dataset.eid, +fx.dataset.i); return; }
  const chip=ev.target.closest('.fchip[data-fn]');
  if(chip) App.openFile(chip.dataset.fn, chip.dataset.ft);
});`);

/* F12 — cancelling a ticket returns its staged uploads to the strip (re-attached by the re-pull merge) */
rep('F12 ticket-cancel salvages uploads',
`      if(open.pmv){ delete open.pmv; audit('Pending move cancelled', nfa+' — same-values re-pull clears the ticket'); }`,
`      if(open.pmv){ if(open.pmv.staged&&open.pmv.staged.length) state.staged.push(...open.pmv.staged); delete open.pmv; audit('Pending move cancelled', nfa+' — same-values re-pull clears the ticket'+(state.staged.length?' (ticket uploads returned to staging)':'')); }`);

/* F13 — role switch closes any open modal; reviewer-only executors hard-guarded */
rep('F13a setRole closes modals',
`  setRole(r){ state.role=r; if((state.page===2||state.page===3) && r==='user') state.page=1; state.expanded=null; render(); toast('Now viewing as <b>'+esc(userName())+'</b>'); },`,
`  setRole(r){ state.role=r; if((state.page===2||state.page===3) && r==='user') state.page=1; state.expanded=null; closeModal(); render(); toast('Now viewing as <b>'+esc(userName())+'</b>'); },`);
rep('F13b lockSheet guard',
`  lockSheet(){ const idx=state.idxSel[2], date=state.dateSel[2], s=sheet(idx,date);`,
`  lockSheet(){ if(!isReviewerish()) return; const idx=state.idxSel[2], date=state.dateSel[2], s=sheet(idx,date);`);
rep('F13c doMigrate guard',
`  doMigrate(){ const idx=state.idxSel[2], date=state.dateSel[2], to=state.migTo, s=sheet(idx,date);`,
`  doMigrate(){ if(!isReviewerish()) return; const idx=state.idxSel[2], date=state.dateSel[2], to=state.migTo, s=sheet(idx,date);`);
rep('F13d doPublish guard',
`  doPublish(){ const idx=state.idxSel[3], date=state.dateSel[3], s=sheet(idx,date);`,
`  doPublish(){ if(!isReviewerish()) return; const idx=state.idxSel[3], date=state.dateSel[3], s=sheet(idx,date);`);

fs.writeFileSync(FILE, html, 'utf8');
console.log('\\nAPPLIED '+applied+' fixes in place → '+FILE+' ('+Buffer.byteLength(html,'utf8')+' bytes)');
