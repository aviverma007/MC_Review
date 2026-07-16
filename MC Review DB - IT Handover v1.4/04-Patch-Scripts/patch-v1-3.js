/* MC Review Dashboard — atomic patch v1.2 → v1.3 (build queue B1–B7)
 * Convention per Claude Code handoff §8: every replacement asserts an exact
 * match count of 1 before applying; the script either fully applies or throws.
 * Run: node patch-v1-3.js
 */
const fs = require('fs');
const SRC = 'mc-review-dashboard-prototype-v1-2.html';
const OUT = 'mc-review-dashboard-prototype-v1-3.html';
let html = fs.readFileSync(SRC, 'utf8');
let applied = 0;

function rep(name, from, to){
  const parts = html.split(from);
  if(parts.length !== 2) throw new Error('PATCH FAIL ['+name+'] — expected exactly 1 match, found '+(parts.length-1));
  html = parts.join(to);
  applied++;
  console.log('OK  '+name);
}

/* ============ B1 — end-of-sheet marker CSS + B2 chip CSS ============ */
rep('R1 css endmark+pmvchip',
`.p1datebox { display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; padding-bottom:7px; }`,
`.p1datebox { display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; padding-bottom:7px; }
/* v1.3: end-of-sheet marker (B1) + pending-move chip (B2) */
.endmark { text-align:center; font-size:10.5px; font-weight:700; letter-spacing:1.5px; color:#000; background:#FAFBFC; padding:9px 0 !important; }
.pmvchip { color:#9A6700; font-weight:700; }`);

/* ============ banner version bump ============ */
rep('R2a banner version',
`<b>PROTOTYPE BUILD v1.2</b>`,
`<b>PROTOTYPE BUILD v1.3</b>`);
rep('R2b banner try-hint',
`Try: fetch <b>14333</b> · re-fetch a presented NFA → lands on P2 deselected · Users: Page 2 is view-only`,
`Try: fetch <b>14333</b> · re-fetch a presented NFA → lands on P2 deselected · re-fetch with a different Index/WT/date → stages a <b>pending move (submit to apply)</b> · Users: Page 2 is view-only`);

/* ============ B3 — strip date session-persistent, defaults to today ============ */
rep('R3 state qeDate init',
`p1tab:'entries', p1date:TODAY, qeDate:null,`,
`p1tab:'entries', p1date:TODAY, qeDate:TODAY,`);
rep('R4 calPick p1 independence',
`if(cb==='p1'){ state.p1date=ds; state.qeDate=null; render(); }`,
`if(cb==='p1'){ state.p1date=ds; render(); }`);

/* ============ B2/B3 helpers ============ */
rep('R5 helpers dispDate/shortRef/p1Listed',
`function initLine(x){ const d=fmtInit(x.f?x.f.initDt:x.initDt); return d?'<div class="sub">(Initiated on '+d+')</div>':''; }`,
`function initLine(x){ const d=fmtInit(x.f?x.f.initDt:x.initDt); return d?'<div class="sub">(Initiated on '+d+')</div>':''; }
/* v1.3 helpers: B2 pending-move display date · B3 today-view row set */
function dispDate(e){ return e.pmv ? e.pmv.date : e.date; }
function shortRef(i,d){ return i+'·'+d.slice(0,6); }
function p1Listed(){
  const OPEN=['draft','submitted','presented'];
  if(ts(state.p1date)===ts(TODAY)) return myEntries().filter(e=> dispDate(e)===TODAY || (ts(dispDate(e))>ts(TODAY) && (OPEN.includes(e.status)||!!e.pmv)));
  return myEntries().filter(e=> dispDate(e)===state.p1date);
}`);

/* ============ B7 — replace-by-name helper ============ */
rep('R6 applyQmsFiles helper',
`  return Object.assign({ id:++eid, nfa, mode:'A', index, wt, date, f:{...q}, hyb:H(nfa), files:q.files.map(f=>({...f,src:'qms'})), resubReq:!!registry[nfa], resubComment:'', initiator:q.initiator, enteredBy, status:'draft', sel:false, mc:false, touch:{}, orders:[] }, extra||{});
}`,
`  return Object.assign({ id:++eid, nfa, mode:'A', index, wt, date, f:{...q}, hyb:H(nfa), files:q.files.map(f=>({...f,src:'qms'})), resubReq:!!registry[nfa], resubComment:'', initiator:q.initiator, enteredBy, status:'draft', sel:false, mc:false, touch:{}, orders:[] }, extra||{});
}
/* B7: a re-pull replaces QMS-sourced files by filename and restores missing ones; user uploads are never touched */
function applyQmsFiles(e,q){ let restored=0, replaced=0;
  q.files.forEach(f=>{ const i=e.files.findIndex(x=>x.n===f.n);
    if(i<0){ e.files.push({...f,src:'qms'}); restored++; }
    else if(e.files[i].src==='qms'){ e.files[i]={...f,src:'qms'}; replaced++; } });
  return {restored,replaced};
}`);

/* ============ B3 — renderP1Entries: today-view row set, sorting, strip date ============ */
rep('R7 renderP1Entries rows',
`  const rows = myEntries().filter(e=>e.date===state.p1date)
    .filter(e=>!q || (e.nfa+' '+e.f.desc+' '+e.f.vendor+' '+e.f.project+' '+e.initiator).toLowerCase().includes(q))
    .sort((a,b)=>a.id-b.id);
  const checked = rows.filter(e=>e.sel && editableEntry(e)).length;
  const qeD = state.qeDate || state.p1date;`,
`  const rows = p1Listed()
    .filter(e=>!q || (e.nfa+' '+e.f.desc+' '+e.f.vendor+' '+e.f.project+' '+e.initiator).toLowerCase().includes(q))
    .sort((a,b)=> ts(dispDate(a))-ts(dispDate(b)) || a.id-b.id);
  const checked = rows.filter(e=>e.sel && (editableEntry(e)||e.pmv)).length;
  const qeD = state.qeDate;`);
rep('R8 select-all header state',
`(rows.length&&rows.every(e=>!editableEntry(e)||e.sel)?'checked':'')`,
`(rows.length&&rows.every(e=>!(editableEntry(e)||e.pmv)||e.sel)?'checked':'')`);
rep('R9 showing label today-view',
`'<span class="filterlbl">Showing: <b>'+state.p1date+'</b></span>'+`,
`'<span class="filterlbl">Showing: <b>'+state.p1date+(ts(state.p1date)===ts(TODAY)?' · today view — all open entries incl. future dates':'')+'</b></span>'+`);
rep('R10 rename Entry Date View',
`<span class="p1datebox">Review date: `,
`<span class="p1datebox">Entry Date View: `);
rep('R11 legend today-view',
`list shows the selected review date only (today onward — history lives in Published PDFs &amp; NFA Search)`,
`today&rsquo;s view lists <b>all open entries (today + every future review date)</b>; pick a future date to filter to that date only — history lives in Published PDFs &amp; NFA Search`);

/* ============ B2 — p1Row pending values + chip + ticket checkbox ============ */
rep('R12 p1Row pending display vars',
`function p1Row(e,sno){
  const edit=editableEntry(e); const flag=flagInfo(e.nfa);
  const locked=['APPROVED','HOLD','REJECTED','expired','presented'].includes(e.status);
  const rate=hybFinal(e.hyb.rate); const rateUser=(!e.hyb.rate.pfn);
  const future=ts(e.date)>ts(TODAY);`,
`function p1Row(e,sno){
  const edit=editableEntry(e); const flag=flagInfo(e.nfa);
  const t=e.pmv, dIdx=t?t.index:e.index, dWt=t?t.wt:e.wt, dDate=t?t.date:e.date;
  const locked=['APPROVED','HOLD','REJECTED','expired','presented'].includes(e.status);
  const rate=hybFinal(e.hyb.rate); const rateUser=(!e.hyb.rate.pfn);
  const future=ts(dDate)>ts(TODAY);`);
rep('R13 p1Row pending chip',
`  if(flag && edit) statusCell += '<div class="sub" style="color:#9A6700;font-weight:700;">Resubmit — '+flag.o+' '+flag.date+'</div>';`,
`  if(flag && edit) statusCell += '<div class="sub" style="color:#9A6700;font-weight:700;">Resubmit — '+flag.o+' '+flag.date+'</div>';
  if(t) statusCell += '<div class="sub pmvchip">Pending move from '+shortRef(e.index,e.date)+' — submit to apply · previous entry still on Page 2</div>';`);
rep('R14 p1Row ticket checkbox',
`'<td>'+(edit?'<input type="checkbox" class="cbx" '+(e.sel?'checked':'')+' onclick="App.toggleSel('+e.id+',this.checked)">':'<input type="checkbox" class="cbx" disabled>')+'</td>'+`,
`'<td>'+((edit||t)?'<input type="checkbox" class="cbx" '+(e.sel?'checked':'')+' onclick="App.toggleSel('+e.id+',this.checked)">':'<input type="checkbox" class="cbx" disabled>')+'</td>'+`);
rep('R15 p1Row pending idx/wt cells',
`'<td>'+e.index+'</td><td><b>'+e.wt+'</b> · '+WT[e.wt]+'</td><td>'`,
`'<td>'+dIdx+'</td><td><b>'+dWt+'</b> · '+WT[dWt]+'</td><td>'`);
rep('R16 p1Row pending date cell',
`'<td'+(future?' style="font-weight:700"':'')+'>'+e.date+'</td>'+`,
`'<td'+(future?' style="font-weight:700"':'')+'>'+dDate+'</td>'+`);

/* ============ B2/B3/B7 — fetchQMS: pending-move ticket, no view-jump, replace-by-name ============ */
rep('R17a fetchQMS open branch',
`    /* RE-PULL: open entry exists → refresh QMS fields + restore attachments; on a locked sheet it auto-deselects from Present to MC */
    const open=state.entries.find(e=>e.nfa===nfa&&['draft','submitted','presented'].includes(e.status));
    if(open){
      const os=sheet(open.index,open.date);
      if(os.publishedRev){ toast('Blocked — MC review for '+IDX[open.index]+' · '+open.date+' is <b>published; the date is closed</b>. A fresh entry on the next review date is the only path.','err'); return; }
      const wasSel = open.status==='presented' || open.mc;
      Object.assign(open.f, q);
      open.hyb.rate.qms=q.rate; open.hyb.reason.qms=q.reason; open.hyb.remarks.qms='Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability);
      let restored=0; q.files.forEach(f=>{ if(!open.files.some(x=>x.n===f.n)){ open.files.push({...f,src:'qms'}); restored++; } });
      if(state.staged.length){ open.files.push(...state.staged); state.staged=[]; }
      if(open.status==='presented') open.status='submitted';
      open.mc=false;
      state.p1date=open.date; state.qe=null; state.qeDate=null; state.expanded=open.id;
      audit('Re-pull from QMS'+(wasSel?' — auto-deselected from Present to MC':''), nfa+(restored?' · '+restored+' QMS attachment(s) restored':''));
      render(); App.clearStrip(); const r=document.getElementById('row'+open.id); if(r){ r.classList.add('flash'); r.scrollIntoView({block:'center'}); }
      toast('<b>'+esc(nfa)+'</b> re-pulled'+(open.status==='submitted'?' &amp; updated on Page 2':' — fields refreshed (draft: check &amp; Submit to send to Page 2)')+(restored?' · '+restored+' attachment(s) restored':'')+(wasSel?' — <b>auto-deselected from Present to MC</b> until the reviewer re-marks it; Page 3 keeps the locked snapshot':'')+' (review date '+open.date+')');
      return;
    }`,
`    /* RE-PULL / B2 PENDING-MOVE: an open entry exists for this NFA (D5 — one open entry system-wide) */
    const open=state.entries.find(e=>e.nfa===nfa&&['draft','submitted','presented'].includes(e.status));
    if(open){
      const os=sheet(open.index,open.date);
      if(os.publishedRev){ toast('Blocked — MC review for '+IDX[open.index]+' · '+open.date+' is <b>published; the date is closed</b>. A fresh entry on the next review date is the only path.','err'); return; }
      const differs = open.index!==idx || open.wt!==wt || ts(open.date)!==ts(date);
      if(differs && open.status!=='draft'){
        /* B2: submit-gated relocation — stage a pending-move ticket; nothing changes on Page 2 until Submit */
        if(sheet(idx,date).publishedRev){ toast('Blocked — target '+IDX[idx]+' · '+date+' is <b>published; the date is closed</b>. Pick another target date for the move.','err'); return; }
        const replacing=!!open.pmv;
        open.pmv={ index:idx, wt, date, f:{...q}, staged:state.staged.splice(0) };
        open.sel=true;
        state.qe=null; state.expanded=open.id;
        audit('Pending move '+(replacing?'replaced':'staged'), nfa+' · '+shortRef(open.index,open.date)+' → '+shortRef(idx,date)+' (submit to apply)');
        render(); App.clearStrip(); const rr=document.getElementById('row'+open.id); if(rr){ rr.classList.add('flash'); rr.scrollIntoView({block:'center'}); }
        toast('<b>'+esc(nfa)+'</b> — pending move from <b>'+shortRef(open.index,open.date)+'</b> to <b>'+shortRef(idx,date)+'</b> staged; QMS fields &amp; attachments refresh with it. <b>Submit to apply</b> — previous entry still on Page 2 (target review date '+date+')','warn');
        return;
      }
      /* same values → any pending ticket is cancelled; normal re-pull (a draft may also take new strip values directly — it has no Page-2 presence) */
      if(open.pmv){ delete open.pmv; audit('Pending move cancelled', nfa+' — same-values re-pull clears the ticket'); }
      if(differs){ open.index=idx; open.wt=wt; open.date=date; audit('Draft re-pull with new strip values', nfa+' → '+shortRef(idx,date)); }
      const wasSel = open.status==='presented' || open.mc;
      Object.assign(open.f, q);
      open.hyb.rate.qms=q.rate; open.hyb.reason.qms=q.reason; open.hyb.remarks.qms='Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability);
      const fr=applyQmsFiles(open, q);
      if(state.staged.length){ open.files.push(...state.staged); state.staged=[]; }
      if(open.status==='presented') open.status='submitted';
      open.mc=false;
      state.qe=null; state.expanded=open.id;
      audit('Re-pull from QMS'+(wasSel?' — auto-deselected from Present to MC':''), nfa+(fr.restored?' · '+fr.restored+' QMS attachment(s) restored':'')+(fr.replaced?' · '+fr.replaced+' QMS file(s) replaced by name':''));
      render(); App.clearStrip(); const r=document.getElementById('row'+open.id); if(r){ r.classList.add('flash'); r.scrollIntoView({block:'center'}); }
      toast('<b>'+esc(nfa)+'</b> re-pulled'+(open.status==='submitted'?' &amp; updated on Page 2':' — fields refreshed (draft: check &amp; Submit to send to Page 2)')+(fr.restored?' · '+fr.restored+' attachment(s) restored':'')+(fr.replaced?' · '+fr.replaced+' QMS file(s) replaced by name (uploads untouched)':'')+(wasSel?' — <b>auto-deselected from Present to MC</b> until the reviewer re-marks it; Page 3 keeps the locked snapshot':'')+' (review date '+open.date+')');
      return;
    }`);
rep('R17b fetchQMS creation no-jump',
`    state.qe=null; state.qeDate=null; state.p1date=date;`,
`    state.qe=null;`);
rep('R17c fetchQMS creation toast names date',
`    toast('NFA <b>'+esc(nfa)+'</b> populated from QMS — review below, then check &amp; Submit');`,
`    toast('NFA <b>'+esc(nfa)+'</b> populated from QMS (review date <b>'+date+'</b>) — review below, then check &amp; Submit');`);

/* ============ Mode B — no view-jump, toast names date ============ */
rep('R18a openModeB strip date',
`    state.mbDate=state.qeDate||state.p1date;`,
`    state.mbDate=state.qeDate;`);
rep('R18b createModeB no-jump',
`    state.staged=[]; state.p1date=date; state.entries.push(e); state.expanded=e.id; audit('Entry created (Mode B)', ref+' · '+idx+' · '+wt);`,
`    state.staged=[]; state.entries.push(e); state.expanded=e.id; audit('Entry created (Mode B)', ref+' · '+idx+' · '+wt+' · '+date);`);
rep('R18c createModeB toast names date',
`toast('Mode B entry created — interim reference <b>'+ref+'</b>');`,
`toast('Mode B entry created — interim reference <b>'+ref+'</b> (review date '+date+')');`);

/* ============ B7 — refreshQMS (row-editor re-pull) ============ */
rep('R19 refreshQMS replace-by-name',
`  refreshQMS(id){ const e=state.entries.find(x=>x.id===id); const q=QMS[e.nfa]; if(!q) return; ['rate','reason'].forEach(k=>{ e.hyb[k].qms=q[k]; }); e.hyb.remarks.qms='Value ₹'+q.val+' L. '+q.reasonability; e.f={...q}; let restored=0; q.files.forEach(f=>{ if(!e.files.some(x=>x.n===f.n)){ e.files.push({...f,src:'qms'}); restored++; } }); audit('QMS refresh', e.nfa); render(); toast('Re-pulled from QMS — ticked fields refreshed'+(restored?', '+restored+' attachment(s) restored':'')+'; your overrides untouched'); },`,
`  refreshQMS(id){ const e=state.entries.find(x=>x.id===id); const q=QMS[e.nfa]; if(!q) return; ['rate','reason'].forEach(k=>{ e.hyb[k].qms=q[k]; }); e.hyb.remarks.qms='Value ₹'+q.val+' L. '+q.reasonability; e.f={...q}; const fr=applyQmsFiles(e,q); audit('QMS refresh', e.nfa+(fr.replaced?' · '+fr.replaced+' QMS file(s) replaced by name':'')); render(); toast('Re-pulled from QMS — ticked fields refreshed'+(fr.restored?', '+fr.restored+' attachment(s) restored':'')+(fr.replaced?', '+fr.replaced+' QMS file(s) replaced by name':'')+'; your overrides &amp; uploads untouched'); },`);

/* ============ B3 — selAll over listed rows ============ */
rep('R20 selAll',
`  selAll(v){ myEntries().filter(e=>e.date===state.p1date).forEach(e=>{ if(editableEntry(e)) e.sel=v; }); render(); },`,
`  selAll(v){ p1Listed().forEach(e=>{ if(editableEntry(e)||e.pmv) e.sel=v; }); render(); },`);

/* ============ B2 — submitChecked + applyMove (atomic swap with revalidation) ============ */
rep('R21 submitChecked + applyMove',
`  submitChecked(){
    let n=0, blocked=0;
    myEntries().filter(e=>e.date===state.p1date).forEach(e=>{
      if(!editableEntry(e)) return;
      if(e.sel && e.status==='draft'){
        if(e.resubReq && !e.resubComment.trim()){ blocked++; state.expanded=e.id; toast('<b>'+esc(e.nfa)+'</b>: resubmission comment is mandatory before submit','err'); return; }
        const sh=sheet(e.index,e.date); e.status='submitted'; if(sh.locked) e.mc=false;
        n++; audit('Submitted → Page 2'+(sh.locked?' (locked sheet — arrives deselected)':''), e.nfa+' · '+e.date);
      } else if(!e.sel && e.status==='submitted'){ e.status='draft'; e.mc=false; audit('Withdrawn from Page 2', e.nfa); }
    });
    render(); if(n) toast(n+' entr'+(n>1?'ies':'y')+' submitted → Page 2'+(blocked?' · '+blocked+' blocked':''));
    else if(!blocked) toast('Nothing new to submit — check entries first','warn');
  },`,
`  submitChecked(){
    let n=0, blocked=0, moved=0; const names=[];
    p1Listed().forEach(e=>{
      if(e.pmv){ if(!e.sel) return; const res=App.applyMove(e); if(res==='moved') moved++; else blocked++; return; }
      if(!editableEntry(e)) return;
      if(e.sel && e.status==='draft'){
        if(e.resubReq && !e.resubComment.trim()){ blocked++; state.expanded=e.id; toast('<b>'+esc(e.nfa)+'</b>: resubmission comment is mandatory before submit','err'); return; }
        const sh=sheet(e.index,e.date); e.status='submitted'; if(sh.locked) e.mc=false;
        n++; names.push(esc(e.nfa)+' → '+e.date); audit('Submitted → Page 2'+(sh.locked?' (locked sheet — arrives deselected)':''), e.nfa+' · '+e.date);
      } else if(!e.sel && e.status==='submitted'){ e.status='draft'; e.mc=false; audit('Withdrawn from Page 2', e.nfa); }
    });
    render(); if(n||moved) toast((n?n+' entr'+(n>1?'ies':'y')+' submitted → Page 2 ('+names.join(' · ')+')':'')+(moved?((n?' · ':'')+moved+' pending move'+(moved>1?'s':'')+' applied'):'')+(blocked?' · '+blocked+' blocked':''));
    else if(!blocked) toast('Nothing new to submit — check entries first','warn');
  },
  /* B2: apply a pending-move ticket at Submit — atomic swap with submit-time revalidation (O2-rework + O7) */
  applyMove(e){
    const t=e.pmv, oldIdx=e.index, oldDate=e.date;
    const os=sheet(oldIdx,oldDate);
    /* 1 — old date published mid-pending → ticket converts to the fresh-entry path (resub flag + mandatory comment) */
    if(os.publishedRev){
      delete e.pmv;
      let ne;
      if(['draft','submitted'].includes(e.status)){ ne=e; ne.index=t.index; ne.wt=t.wt; ne.date=t.date; ne.status='draft'; Object.assign(ne.f,t.f); applyQmsFiles(ne,t.f); }
      else { ne=mkEntry(e.nfa,t.index,t.wt,t.date,userName()); ne.f={...t.f}; state.entries.push(ne); }
      if(t.staged&&t.staged.length) ne.files.push(...t.staged);
      ne.resubReq=true; ne.sel=true; ne.mc=false;
      state.expanded=ne.id;
      audit('Pending move → fresh entry', e.nfa+' — '+shortRef(oldIdx,oldDate)+' published mid-pending; resubmission comment mandatory');
      toast('<b>'+esc(e.nfa)+'</b>: '+shortRef(oldIdx,oldDate)+' was <b>published</b> while the move was pending — converted to a <b>fresh entry</b> on '+t.date+'. Resubmission comment is <b>mandatory</b>, then Submit again.','warn');
      return 'blocked';
    }
    /* 2 — target date published → refused; ticket stays editable */
    if(sheet(t.index,t.date).publishedRev){ toast('<b>'+esc(e.nfa)+'</b>: target '+IDX[t.index]+' · '+t.date+' is <b>published; the date is closed</b> — pending move refused. Fetch with new values to edit the ticket, or fetch with the original values to cancel it.','err'); return 'blocked'; }
    /* 3 — O7 decided-gate: presented + decided in MC → refused (operator can clear the decision to release the move) */
    const snapRow=os.snapRows.find(r=>r.id===e.id);
    if(e.status==='presented' && snapRow && os.dec[e.id]){ toast('<b>'+esc(e.nfa)+'</b> — <b>already reviewed in MC</b> — outcome will publish; re-present via a fresh entry after the PDF. (The MC operator can clear the decision to release this move.)','err'); return 'blocked'; }
    /* 4 — atomic swap: old Page-2 presence removed; entry committed to the new index/WT/date */
    const wasPresented = e.status==='presented' && !!snapRow;
    e.index=t.index; e.wt=t.wt; e.date=t.date;
    Object.assign(e.f,t.f);
    e.hyb.rate.qms=t.f.rate; e.hyb.reason.qms=t.f.reason; e.hyb.remarks.qms='Value ₹'+t.f.val+' L. '+(t.f.reasonability==='—'?'':t.f.reasonability);
    const fr=applyQmsFiles(e,t.f);
    if(t.staged&&t.staged.length) e.files.push(...t.staged);
    e.status='submitted'; e.mc=false; e.sel=false; delete e.pmv;
    if(wasPresented) snapRow.relocated=shortRef(t.index,t.date);
    const tgt=sheet(t.index,t.date);
    audit('Entry relocated', e.nfa+' · '+shortRef(oldIdx,oldDate)+' → '+shortRef(t.index,t.date)+' (submit-gated)'+(fr.replaced?' · '+fr.replaced+' QMS file(s) replaced by name':''));
    toast('<b>'+esc(e.nfa)+'</b> relocated '+shortRef(oldIdx,oldDate)+' → <b>'+shortRef(t.index,t.date)+'</b> (review date '+t.date+')'+(tgt.locked?' — arrived <b>deselected on a locked sheet</b>; snapshot v'+tgt.version+' untouched':'')+(wasPresented?' · the old Page-3 row now carries a relocated marker — decisions there record to NFA history only':''));
    return 'moved';
  },`);

/* ============ B2 — P3 ghost marker on departed snapshot rows ============ */
rep('R22 p3Row relocated marker',
`+esc(r.nfa)+initLine(r)+'</td><td>'+esc(r.f.pendWith)+`,
`+esc(r.nfa)+initLine(r)+(r.relocated?'<div class="sub pmvchip">live entry relocated to '+r.relocated+' — decisions record to NFA history only</div>':'')+'</td><td>'+esc(r.f.pendWith)+`);

/* ============ B2/F8 — publish writes live status only if entry still resides on the publishing sheet ============ */
rep('R23a doPublish F8 decided',
`    decided.forEach(r=>{ const e=state.entries.find(x=>x.id===r.id); if(e){ e.status=s.dec[r.id].s; e.mcFinal=s.mcC[r.id]||''; } (registry[r.nfa]=registry[r.nfa]||[]).push({date,o:s.dec[r.id].s}); });`,
`    decided.forEach(r=>{ const e=state.entries.find(x=>x.id===r.id); if(e && e.index===idx && e.date===date){ e.status=s.dec[r.id].s; e.mcFinal=s.mcC[r.id]||''; } (registry[r.nfa]=registry[r.nfa]||[]).push({date,o:s.dec[r.id].s}); });`);
rep('R23b doPublish F8 undecided',
`    und.forEach(r=>{ const e=state.entries.find(x=>x.id===r.id); if(e) e.status='expired'; (registry[r.nfa]=registry[r.nfa]||[]).push({date,o:'UNDECIDED'}); });`,
`    und.forEach(r=>{ const e=state.entries.find(x=>x.id===r.id); if(e && e.index===idx && e.date===date) e.status='expired'; (registry[r.nfa]=registry[r.nfa]||[]).push({date,o:'UNDECIDED'}); });`);
rep('R23c doPublish audit ghosts',
`    audit('PUBLISHED Rev-1', IDX[idx]+' '+date+' · A'+c.APPROVED+'/H'+c.HOLD+'/R'+c.REJECTED+(und.length?' · excluded: '+und.map(r=>r.nfa).join(','):''));`,
`    audit('PUBLISHED Rev-1', IDX[idx]+' '+date+' · A'+c.APPROVED+'/H'+c.HOLD+'/R'+c.REJECTED+(und.length?' · excluded: '+und.map(r=>r.nfa).join(','):'')+(s.snapRows.some(r=>r.relocated)?' · relocated row(s) closed to history only (F8)':''));`);

/* ============ B1 — end-of-sheet marker, Page 2 ============ */
rep('R24 renderP2 endmark',
`  if(!rows) rows='<tr><td colspan="'+(admin?20:19)+'"><div class="emptystate">No submitted entries for this index + date yet.</div></td></tr>';`,
`  if(rows) rows+='<tr><td class="endmark" colspan="'+(admin?20:19)+'">- - x End of Sheet x - -</td></tr>';
  if(!rows) rows='<tr><td colspan="'+(admin?20:19)+'"><div class="emptystate">No submitted entries for this index + date yet.</div></td></tr>';`);

/* ============ B1 — end-of-sheet marker, Page 3 ============ */
rep('R25 renderP3 endmark',
`  Object.keys(WT).forEach(w=>{
    const grp=snap.filter(r=>r.wt===w); if(!grp.length) return;
    rows+='<tr class="band"><td colspan="23">'+w+'. '+WT[w].toUpperCase()+'</td></tr>';
    grp.forEach((r,i)=>{ rows+=p3Row(r,i+1,s); });
  });`,
`  Object.keys(WT).forEach(w=>{
    const grp=snap.filter(r=>r.wt===w); if(!grp.length) return;
    rows+='<tr class="band"><td colspan="23">'+w+'. '+WT[w].toUpperCase()+'</td></tr>';
    grp.forEach((r,i)=>{ rows+=p3Row(r,i+1,s); });
  });
  rows+='<tr><td class="endmark" colspan="23">- - x End of Sheet x - -</td></tr>';`);

/* ============ B4 — Publish disabled entirely on an empty snapshot ============ */
rep('R26 empty-snapshot publish disabled',
`'<span class="spacer"></span><span class="st grey">Publish unavailable — empty selection</span>'`,
`'<span class="spacer"></span><span class="st grey">Empty snapshot — nothing to publish</span> <button class="btn primary" disabled>Publish PDF — '+IDX[idx]+'</button>'`);

/* ============ B4 — zero-decided publish warning ============ */
rep('R27 zero-decided warning',
`    (und.length?('<b>Undecided — will be excluded from the PDF and expire:</b> '+und.map(r=>esc(r.nfa)).join(', ')):'All presented entries are decided.')+'</p>'+`,
`    (und.length?(((s.snapRows.length-und.length)===0?'<b class="rej st">0 decided — publishing will expire all '+und.length+' presented entries.</b><br>':'')+'<b>Undecided — will be excluded from the PDF and expire:</b> '+und.map(r=>esc(r.nfa)).join(', ')):'All presented entries are decided.')+'</p>'+`);

/* ============ B5 — migrate into a locked target: allowed, arrivals deselected, lock + snapshot untouched ============ */
rep('R28 doMigrate locked-target toast',
`    audit('Bulk migrate', idx+' '+date+' → '+to+' · '+pool.length+' entries · selections reset');
    state.dateSel[2]=to; state.dateSel[3]=to; closeModal(); render();
    toast(pool.length+' entries migrated &amp; merged into <b>'+to+'</b> — all selections reset for reviewer pass');`,
`    const tgt=sheet(idx,to);
    audit('Bulk migrate', idx+' '+date+' → '+to+' · '+pool.length+' entries · selections reset'+(tgt.locked?' · arrived deselected on a locked sheet (snapshot v'+tgt.version+' untouched)':''));
    state.dateSel[2]=to; state.dateSel[3]=to; closeModal(); render();
    toast(pool.length+' entries migrated &amp; merged into <b>'+to+'</b>'+(tgt.locked?' — '+pool.length+' arrived <b>deselected on a locked sheet</b>; the lock and snapshot v'+tgt.version+' are untouched (reviewer re-marks &amp; re-locks)':' — all selections reset for reviewer pass'));`);

/* ============ B6 — Add-more Generate ============ */
rep('R29 p4Rows add-more button',
`  const genCtl='<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap"><select class="inp" style="width:58px" id="cnt'+e.id+'">'+Array.from({length:state.maxOrders},(_,i)=>'<option '+(i===0?'selected':'')+'>'+(i+1)+'</option>').join('')+'</select>'+
   '<button class="btn sm primary" onclick="App.genOrders('+e.id+')">Generate order number</button></div>'+(e.orders.length?'<div class="sub">'+e.orders.length+' order row'+(e.orders.length>1?'s':'')+' created ↓</div>':'');`,
`  const genCtl='<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap"><select class="inp" style="width:58px" id="cnt'+e.id+'" onchange="App.genLabel('+e.id+',this.value)">'+Array.from({length:state.maxOrders},(_,i)=>'<option '+(i===0?'selected':'')+'>'+(i+1)+'</option>').join('')+'</select>'+
   '<button class="btn sm primary" id="gen'+e.id+'" onclick="App.genOrders('+e.id+')">'+(e.orders.length?'Add 1 more order':'Generate order number')+'</button></div>'+(e.orders.length?'<div class="sub">'+e.orders.length+' order row'+(e.orders.length>1?'s':'')+' created ↓</div>':'');`);
rep('R30 genOrders confirm + genLabel',
`  genOrders(id){ const e=state.entries.find(x=>x.id===id); const n=parseInt(document.getElementById('cnt'+id).value)||1;
    const key='ord'+e.index;`,
`  genLabel(id,v){ const e=state.entries.find(x=>x.id===id); const b=document.getElementById('gen'+id); if(b && e && e.orders.length) b.textContent='Add '+v+' more order'+(+v>1?'s':''); },
  genOrders(id){ const e=state.entries.find(x=>x.id===id); const n=parseInt(document.getElementById('cnt'+id).value)||1;
    if(e.orders.length && !confirm('Add '+n+' more order number'+(n>1?'s':'')+' against '+e.nfa+'? Existing order rows stay untouched.')) return;
    const key='ord'+e.index;`);

fs.writeFileSync(OUT, html, 'utf8');
console.log('\nAPPLIED '+applied+' patches → '+OUT+' ('+Buffer.byteLength(html,'utf8')+' bytes)');
