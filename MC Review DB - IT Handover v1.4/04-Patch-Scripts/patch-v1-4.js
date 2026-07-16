/* MC Review Dashboard — atomic patch v1.3 → v1.4 (fixed Page 1/2/3 format per Excel, 6 Jul 2026)
 * Editable (PfN) fields: PR Budget Value · Reason · Vendors & PQ · Remarks/Status
 * Dropdowns: NFA initiated by (C&P Team/Site) · Validation of Rates (4 values)
 * Dropped: Rate Per Unit · Appr. Note w/ PR · free-text Reasonability
 * Added: Location + PR No. on P2 · computed "Revised order value" · Creator rename
 * Every replacement asserts an exact match count; all-or-nothing.
 */
const fs = require('fs');
const SRC = 'mc-review-dashboard-prototype-v1-3.html';
const OUT = 'mc-review-dashboard-prototype-v1-4.html';
let html = fs.readFileSync(SRC, 'utf8');
let applied = 0;
function repN(name, from, to, n){
  const parts = html.split(from);
  if(parts.length !== n+1) throw new Error('PATCH FAIL ['+name+'] — expected '+n+' match(es), found '+(parts.length-1));
  html = parts.join(to);
  applied++;
  console.log('OK  '+name);
}
const rep = (name, from, to) => repN(name, from, to, 1);

/* ---------- banner ---------- */
rep('V1 banner', `<b>PROTOTYPE BUILD v1.3</b>`, `<b>PROTOTYPE BUILD v1.4</b>`);

/* ---------- QMS decoration, RATEVALS, revisedVal ---------- */
rep('V2 helpers + QMS fields',
`/* ============ STATE ============ */`,
`/* v1.4: fixed Page 1/2/3 format (Excel, 6 Jul) — QMS-side field additions + helpers */
const RATEVALS=['Competitive bidding','Existing rate reference','Rate analysis','Existing Rate & Rate analysis'];
(function(){ const X={
  '14315':['0.80','Site','Competitive bidding'], '14306':['20.00','C&P Team','Competitive bidding'],
  '14331':['10.00','Site','Competitive bidding'], '13594':['32.00','Site','Rate analysis'],
  '14319':['25.00','Site','Existing rate reference'], '14401':['—','C&P Team','Rate analysis'],
  '14402':['—','C&P Team','Rate analysis'], '14355':['—','Site',''],
  '14350':['42.00','Site','Competitive bidding'], '14352':['15.00','C&P Team','Rate analysis'],
  '14333':['12.00','Site','Competitive bidding'], '14313':['2.10','C&P Team',''],
  '14344':['4.00','Site','Competitive bidding'] };
  Object.keys(X).forEach(k=>{ QMS[k].prBudget=X[k][0]; QMS[k].initBy=X[k][1]; QMS[k].rateVal=X[k][2]; });
})();
/* Revised order value = (Last Amendment if numeric, else Original) + This variation; NA when no numeric variation */
function revisedVal(f){ const num=s=>parseFloat(String(s==null?'':s).replace('−','-').replace(/[^0-9.\\-]/g,'')); const v=num(f.variation); if(isNaN(v)) return 'NA'; const base=isNaN(num(f.lastAmd))?num(f.val):num(f.lastAmd); if(isNaN(base)) return 'NA'; return String(Math.round((base+v)*100)/100); }

/* ============ STATE ============ */`);

/* ---------- hybrid model: rate → prBudget + vendPQ ---------- */
rep('V3 H() hybrid keys',
`const H = (nfa) => { const q=QMS[nfa]; return { rate:{pfn:true,qms:q.rate,user:null}, reason:{pfn:true,qms:q.reason,user:null}, remarks:{pfn:true,qms:'Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability),user:null} }; };`,
`const H = (nfa) => { const q=QMS[nfa]; return { prBudget:{pfn:true,qms:q.prBudget||'—',user:null}, reason:{pfn:true,qms:q.reason,user:null}, vendPQ:{pfn:true,qms:q.vendPQ,user:null}, remarks:{pfn:true,qms:'Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability),user:null} }; };`);
rep('V4 mkEntry initBy/rateVal',
`resubReq:!!registry[nfa], resubComment:'', initiator:q.initiator, enteredBy, status:'draft', sel:false, mc:false, touch:{}, orders:[] }, extra||{});`,
`resubReq:!!registry[nfa], resubComment:'', initBy:q.initBy||'', rateVal:q.rateVal||'', initiator:q.initiator, enteredBy, status:'draft', sel:false, mc:false, touch:{}, orders:[] }, extra||{});`);

/* ---------- seeds ---------- */
rep('V5 13594 seed override → reason',
`e=mkEntry('13594','MEP','G',TODAY,'Dhruv'); e.hyb.rate.pfn=false; e.hyb.rate.user=e.hyb.rate.qms;`,
`e=mkEntry('13594','MEP','G',TODAY,'Dhruv'); e.hyb.reason.pfn=false; e.hyb.reason.user=e.hyb.reason.qms;`);
rep('V6 14355 seed override → prBudget',
`e=mkEntry('14355','MEP','A',TODAY,'Kunal Mehra'); e.status='submitted'; e.hyb.rate.pfn=false; e.hyb.rate.user='rate details awaited'; state.entries.push(e);`,
`e=mkEntry('14355','MEP','A',TODAY,'Kunal Mehra'); e.status='submitted'; e.hyb.prBudget.pfn=false; e.hyb.prBudget.user='budget details awaited'; state.entries.push(e);`);
rep('V7 EM seed hyb',
`    hyb:{rate:{pfn:false,qms:'',user:'Comparative BOQ (incl. GST): L1 Gautam Techno 233.20 · L2 Scenario India 235.38 · L3 United Engineer 250.03 · L4 Jagrati 250.39 · L5 Buddhiraja 267.95'},reason:{pfn:false,qms:'',user:'LOI issued on emergent approval; put up for NFA regularisation'},remarks:{pfn:false,qms:'',user:'Emergent approval attached for reference.'}},`,
`    hyb:{prBudget:{pfn:false,qms:'',user:'240.00 (comparative L1 233.20)'},reason:{pfn:false,qms:'',user:'LOI issued on emergent approval; put up for NFA regularisation'},vendPQ:{pfn:false,qms:'',user:'5'},remarks:{pfn:false,qms:'',user:'Emergent approval attached for reference. Comparative BOQ (incl. GST): L1 Gautam Techno 233.20 · L2 Scenario India 235.38 · L3 United Engineer 250.03 · L4 Jagrati 250.39 · L5 Buddhiraja 267.95'}},`);
rep('V8 EM seed initBy/rateVal',
`    resubReq:false, resubComment:'', initiator:'Yash Sharma', enteredBy:'Dhruv', status:'draft', sel:true, mc:false, touch:{}, orders:[] };`,
`    resubReq:false, resubComment:'', initBy:'Site', rateVal:'Competitive bidding', initiator:'Yash Sharma', enteredBy:'Dhruv', status:'draft', sel:true, mc:false, touch:{}, orders:[] };`);

/* ---------- pdfRowFromQMS (seeded published rows) ---------- */
rep('V9 pdfRowFromQMS',
`function pdfRowFromQMS(nfa, wt, dec, mcC, resub){ const q=QMS[nfa]; return {wt,nfa,project:q.project,loc:q.location,desc:q.desc,vendor:q.vendor,val:q.val,amdVal:q.amdVal,variation:q.variation,rate:q.rate,reason:q.reason,reasonability:q.reasonability,vendPQ:q.vendPQ,pr:q.pr,initDt:q.initDt,resub,initiator:q.initiator,mcComment:mcC,dec}; }`,
`function pdfRowFromQMS(nfa, wt, dec, mcC, resub){ const q=QMS[nfa]; return {wt,nfa,project:q.project,loc:q.location,desc:q.desc,vendor:q.vendor,prBudget:q.prBudget||'—',val:q.val,lastAmd:q.lastAmd,variation:q.variation,revised:revisedVal(q),reason:q.reason,rateVal:q.rateVal||'',vendPQ:q.vendPQ,pr:q.pr,initDt:q.initDt,resub,initiator:q.initiator,mcComment:mcC,dec}; }`);

/* ---------- P1 grid ---------- */
rep('V10 p1Row prBudget vars',
`  const rate=hybFinal(e.hyb.rate); const rateUser=(!e.hyb.rate.pfn);`,
`  const prB=hybFinal(e.hyb.prBudget); const prBUser=(!e.hyb.prBudget.pfn);`);
rep('V11 p1Row prBudget cell',
`    '<td'+(rateUser?' class="edit"':'')+'>'+esc(rate)+'</td>'+`,
`    '<td'+(prBUser?' class="edit"':'')+'>'+esc(prB)+'</td>'+`);
rep('V12 p1Row initBy cell',
`    '<td>'+esc(e.initiator)+(e.initiator!==e.enteredBy?' <b class="redstar" title="Proxy entry — entered by '+esc(e.enteredBy)+' (audit-logged)">*</b>':'')+'</td>'+`,
`    '<td>'+esc(e.initiator)+(e.initiator!==e.enteredBy?' <b class="redstar" title="Proxy entry — entered by '+esc(e.enteredBy)+' (audit-logged)">*</b>':'')+'</td>'+
    '<td>'+esc(e.initBy||'—')+'</td>'+`);
rep('V13 P1 colgroup',
`<colgroup><col style="width:36px"><col style="width:42px"><col style="width:108px"><col style="width:60px"><col style="width:155px"><col style="width:100px"><col style="width:255px"><col style="width:175px"><col style="width:68px"><col style="width:235px"><col style="width:120px"><col style="width:100px"><col style="width:195px"><col style="width:155px"></colgroup>`,
`<colgroup><col style="width:36px"><col style="width:42px"><col style="width:108px"><col style="width:60px"><col style="width:155px"><col style="width:100px"><col style="width:245px"><col style="width:170px"><col style="width:78px"><col style="width:105px"><col style="width:115px"><col style="width:100px"><col style="width:100px"><col style="width:190px"><col style="width:150px"></colgroup>`);
rep('V14 P1 headers',
`<th>Vendor Name</th><th>Value ₹L</th><th>Rate Per Unit</th><th>NFA Initiator</th><th>Review Date</th><th>Attached Files (QMS + uploads)</th><th>Status</th></tr>`,
`<th>Vendor Name</th><th>Original Order Value ₹L (incl. GST)</th><th>PR Budget Value ₹L</th><th>Creator</th><th>NFA Initiated By</th><th>Review Date</th><th>Downloadable Files (QMS + uploads)</th><th>Status</th></tr>`);
repN('V15 P1 colspans 14 → 15',
`colspan="14"`,
`colspan="15"`, 2);

/* ---------- P1 editor: cards + dropdowns ---------- */
rep('V16 p1Editor cards',
`    '<div class="fieldsrow">'+card('rate','Rate Per Unit')+card('reason','Reason')+card('remarks','Remarks / Comments')+'</div>'+`,
`    '<div class="fieldsrow">'+card('prBudget','PR Budget Value ₹L')+card('reason','Reason for this New work/variation')+card('vendPQ','No&rsquo;s of Considered Vendors &amp; PQ')+card('remarks','Remarks / Status')+'</div>'+
    '<div class="fieldsrow" style="margin-top:10px">'+
    '<div class="fcard"><h5>NFA Initiated By <span class="pfn">dropdown</span></h5>'+selCtl(e,'initBy',['C&P Team','Site'],edit)+'</div>'+
    '<div class="fcard"><h5>Validation of Rates <span class="pfn">dropdown</span></h5>'+selCtl(e,'rateVal',RATEVALS,edit)+'</div></div>'+`);

/* ---------- re-pull / relocation / refresh hybrid refresh ---------- */
rep('V17 fetchQMS hyb refresh',
`      open.hyb.rate.qms=q.rate; open.hyb.reason.qms=q.reason; open.hyb.remarks.qms='Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability);`,
`      open.hyb.prBudget.qms=q.prBudget||'—'; open.hyb.reason.qms=q.reason; open.hyb.vendPQ.qms=q.vendPQ; open.hyb.remarks.qms='Value ₹'+q.val+' L. '+(q.reasonability==='—'?'':q.reasonability);`);
rep('V18 applyMove hyb refresh',
`    e.hyb.rate.qms=t.f.rate; e.hyb.reason.qms=t.f.reason; e.hyb.remarks.qms='Value ₹'+t.f.val+' L. '+(t.f.reasonability==='—'?'':t.f.reasonability);`,
`    e.hyb.prBudget.qms=t.f.prBudget||'—'; e.hyb.reason.qms=t.f.reason; e.hyb.vendPQ.qms=t.f.vendPQ; e.hyb.remarks.qms='Value ₹'+t.f.val+' L. '+(t.f.reasonability==='—'?'':t.f.reasonability);`);
rep('V19 refreshQMS hyb refresh',
`['rate','reason'].forEach(k=>{ e.hyb[k].qms=q[k]; });`,
`e.hyb.prBudget.qms=q.prBudget||'—'; e.hyb.reason.qms=q.reason; e.hyb.vendPQ.qms=q.vendPQ;`);

/* ---------- Mode B form ---------- */
rep('V20 Mode B field list',
`    const F=[['project','Project'],['location','Location'],['apprNote','Approval Note with PR'],['desc','Description of Work *'],['duration','Duration'],['vendor','Vendor Name *'],['val','Original Order Value ₹L (incl. GST)'],['lastAmd','Last Amendment Value ₹L'],['amdVal','Amendment Value ₹L'],['variation','Variation ₹L'],['rate','Rate Per Unit'],['reason','Reason'],['reasonability','Reasonability of Rates'],['vendPQ','No. of Considered Vendors & PQ'],['pr','PR No.'],['initDt','NFA Initiated on dt'],['pendWith','NFA Approval Pending With'],['initiator','NFA Initiator (free text) *']];`,
`    const F=[['project','Project'],['location','Location'],['desc','Description of Work *'],['duration','Duration'],['vendor','Vendor Name *'],['prBudget','PR Budget Value ₹L'],['val','Original Order Value ₹L (incl. GST)'],['lastAmd','Last Amendment Value ₹L'],['variation','This Variation Value ₹L'],['reason','Reason for this New work/variation'],['vendPQ','No. of Considered Vendors & PQ'],['pr','PR No.'],['initDt','NFA Initiated on dt'],['pendWith','NFA Approval Pending With'],['initiator','Creator (free text) *']];`);
repN('V21 Mode B textarea keys',
`['desc','rate','reason','reasonability'].includes(f[0])`,
`['desc','reason'].includes(f[0])`, 2);
rep('V22 Mode B dropdown row',
`'<div class="field"><label>Review Date <span class="req">*</span></label>'+calBtn(state.mbDate,'mb','id="mbDateBtn"')+'</div></div>'+`,
`'<div class="field"><label>Review Date <span class="req">*</span></label>'+calBtn(state.mbDate,'mb','id="mbDateBtn"')+'</div>'+
      '<div class="field"><label>NFA Initiated By</label><select class="inp" id="mbInitBy"><option value="">Select…</option><option>C&amp;P Team</option><option>Site</option></select></div>'+
      '<div class="field"><label>Validation of Rates</label><select class="inp" id="mbRateVal"><option value="">Select…</option>'+RATEVALS.map(o=>'<option>'+esc(o)+'</option>').join('')+'</select></div></div>'+`);
rep('V23 createModeB keys',
`    const f={}; ['project','location','apprNote','desc','duration','vendor','val','lastAmd','amdVal','variation','rate','reason','reasonability','vendPQ','pr','initDt','pendWith','initiator'].forEach(k=>f[k]=g(k)||'—');`,
`    const f={}; ['project','location','desc','duration','vendor','prBudget','val','lastAmd','variation','reason','vendPQ','pr','initDt','pendWith','initiator'].forEach(k=>f[k]=g(k)||'—');
    f.apprNote='—'; f.amdVal='—'; f.rate='—'; f.reasonability='—';`);
rep('V24 createModeB entry object',
`    const e={ id:++eid, nfa:ref, mode:'B', index:idx, wt, date, f, hyb:{rate:{pfn:false,qms:'',user:f.rate},reason:{pfn:false,qms:'',user:f.reason},remarks:{pfn:false,qms:'',user:'—'}}, files:[...state.staged], resubReq:false, resubComment:'', initiator:f.initiator, enteredBy:userName(), status:'draft', sel:true, mc:false, touch:{}, orders:[] };`,
`    const e={ id:++eid, nfa:ref, mode:'B', index:idx, wt, date, f, hyb:{prBudget:{pfn:false,qms:'',user:f.prBudget},reason:{pfn:false,qms:'',user:f.reason},vendPQ:{pfn:false,qms:'',user:f.vendPQ},remarks:{pfn:false,qms:'',user:'—'}}, files:[...state.staged], resubReq:false, resubComment:'', initBy:document.getElementById('mbInitBy').value||'', rateVal:document.getElementById('mbRateVal').value||'', initiator:f.initiator, enteredBy:userName(), status:'draft', sel:true, mc:false, touch:{}, orders:[] };`);

/* ---------- dropdown cell helpers + App.setSel ---------- */
rep('V25 selCell/selCtl helpers',
`function renderP2(){`,
`/* v1.4: dropdown cells (P2 reviewer) and editor dropdowns (P1) */
function selCell(e,key,options,allowed){ const cur=e[key]||''; const touched=e.touch[key];
  if(!allowed) return '<td class="'+(touched?'yellowcell':'')+'">'+(touched?'<span class="redstar">*</span> ':'')+esc(cur||'—')+'</td>';
  return '<td class="'+(touched?'yellowcell':'')+'">'+(touched?'<span class="redstar">*</span> ':'')+'<select class="inp selcell" data-key="'+key+'" style="width:100%;font-size:11px;padding:4px 5px" onchange="App.setSel('+e.id+',\\''+key+'\\',this.value)"><option value=""'+(cur?'':' selected')+'>—</option>'+options.map(o=>'<option'+(o===cur?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select></td>'; }
function selCtl(e,key,options,allowed){ const cur=e[key]||'';
  return '<select class="inp edsel" data-key="'+key+'" style="width:100%" '+(allowed?'':'disabled')+' onchange="App.setSel('+e.id+',\\''+key+'\\',this.value)"><option value=""'+(cur?'':' selected')+'>Select…</option>'+options.map(o=>'<option'+(o===cur?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>'; }
function renderP2(){`);
rep('V26 App.setSel',
`  p2Blur(el){ const e=state.entries.find(x=>x.id==el.dataset.id); if(el.innerText!==el.dataset.orig){ e.touch[el.dataset.key]=true; audit('Reviewer touch-up', e.nfa+' · '+el.dataset.key); render(); } },`,
`  p2Blur(el){ const e=state.entries.find(x=>x.id==el.dataset.id); if(el.innerText!==el.dataset.orig){ e.touch[el.dataset.key]=true; audit('Reviewer touch-up', e.nfa+' · '+el.dataset.key); render(); } },
  setSel(id,key,v){ const e=state.entries.find(x=>x.id===id); if(!e) return; e[key]=v;
    if(state.page===2 && isReviewerish()){ e.touch[key]=true; audit('Reviewer touch-up', e.nfa+' · '+key+' → '+(v||'—')); }
    else audit('Field set', e.nfa+' · '+key+' → '+(v||'—'));
    render(); },`);

/* ---------- P2 columns ---------- */
rep('V27 P2 colgroup',
`  let cols='<colgroup><col style="width:38px"><col style="width:96px"><col style="width:90px"><col style="width:66px"><col style="width:245px"><col style="width:66px"><col style="width:172px"><col style="width:70px"><col style="width:218px"><col style="width:172px"><col style="width:58px"><col style="width:88px"><col style="width:82px"><col style="width:186px"><col style="width:112px">'+(admin?'<col style="width:96px">':'')+'<col style="width:165px"><col style="width:125px"><col style="width:70px"></colgroup>';`,
`  let cols='<colgroup><col style="width:38px"><col style="width:68px"><col style="width:96px"><col style="width:88px"><col style="width:60px"><col style="width:104px"><col style="width:94px"><col style="width:225px"><col style="width:64px"><col style="width:165px"><col style="width:94px"><col style="width:72px"><col style="width:68px"><col style="width:68px"><col style="width:74px"><col style="width:195px"><col style="width:122px"><col style="width:70px"><col style="width:82px"><col style="width:180px">'+(admin?'<col style="width:96px">':'')+'<col style="width:165px"><col style="width:125px"><col style="width:70px"></colgroup>';`);
rep('V28 P2 thead',
`  let thead='<tr><th>S.No</th><th>NFA No.</th><th>Project</th><th>Appr. Note w/ PR</th><th>Description of Work</th><th>Duration</th><th>Vendor Name</th><th>Value ₹L (incl. GST)</th><th>Rate Per Unit</th><th>Reason</th><th>Vend. &amp; PQ</th><th>PR No.</th><th>Pending With</th><th>Remark from NFA Creator (resubmission)</th><th>NFA Initiator</th>'+(admin?'<th>Entered By <em style="font-style:normal;font-size:8px;border:1px solid #C4CAD2;padding:0 2px;color:#000">ADMIN</em></th>':'')+'<th>Selected Files (shown on P2 &amp; P3)</th><th>Flags</th><th>Present to MC</th></tr>';`,
`  let thead='<tr><th>S.No</th><th>PR No.</th><th>NFA No.</th><th>Project</th><th>Location</th><th>Creator</th><th>NFA Initiated By</th><th>Description of Work</th><th>Duration</th><th>Vendor Name</th><th>PR Budget Value ₹L</th><th>Original Order Value ₹L (incl. GST)</th><th>Last Amend. Value ₹L</th><th>This Variation ₹L</th><th>Revised Order Value ₹L</th><th>Reason for this New work/variation</th><th>Validation of Rates</th><th>Vendors &amp; PQ</th><th>NFA Approval Pending With</th><th>Remark from NFA Creator (resubmission)</th>'+(admin?'<th>Entered By <em style="font-style:normal;font-size:8px;border:1px solid #C4CAD2;padding:0 2px;color:#000">ADMIN</em></th>':'')+'<th>Downloadable Files (shown on P2 &amp; P3)</th><th>Flags</th><th>Present to MC</th></tr>';`);
repN('V29 P2 colspans',
`colspan="'+(admin?20:19)+'"`,
`colspan="'+(admin?24:23)+'"`, 3);
rep('V30 p2Row cells',
`  return '<tr class="'+(dim?'rowdim':'')+'">'+
   '<td>'+sno+'</td><td class="nfa">'+esc(e.nfa)+initLine(e)+'</td><td>'+esc(e.f.project)+'</td><td>'+esc(e.f.apprNote)+'</td><td>'+esc(e.f.desc)+'</td><td>'+esc(e.f.duration)+'</td><td>'+esc(e.f.vendor)+'</td><td><b>'+esc(e.f.val)+'</b></td>'+
   edCell(e,'rate',canEdit,!e.hyb.rate.pfn)+
   edCell(e,'reason',canEdit,!e.hyb.reason.pfn)+
   '<td>'+esc(e.f.vendPQ)+'</td><td>'+esc(e.f.pr)+'</td><td>'+esc(e.f.pendWith)+'</td>'+
   edCell(e,'resub',canEdit,!!e.resubComment)+
   '<td>'+esc(e.initiator)+(e.initiator!==e.enteredBy?' <b class="redstar" title="Proxy — entered by '+esc(e.enteredBy)+'">*</b>':'')+'</td>'+
   (admin?'<td>'+esc(e.enteredBy)+'</td>':'')+`,
`  return '<tr class="'+(dim?'rowdim':'')+'">'+
   '<td>'+sno+'</td><td>'+esc(e.f.pr)+'</td><td class="nfa">'+esc(e.nfa)+initLine(e)+'</td><td>'+esc(e.f.project)+'</td><td>'+esc(e.f.location)+'</td>'+
   '<td>'+esc(e.initiator)+(e.initiator!==e.enteredBy?' <b class="redstar" title="Proxy — entered by '+esc(e.enteredBy)+'">*</b>':'')+'</td>'+
   selCell(e,'initBy',['C&P Team','Site'],canEdit)+
   '<td>'+esc(e.f.desc)+'</td><td>'+esc(e.f.duration)+'</td><td>'+esc(e.f.vendor)+'</td>'+
   edCell(e,'prBudget',canEdit,!e.hyb.prBudget.pfn)+
   '<td><b>'+esc(e.f.val)+'</b></td><td>'+esc(e.f.lastAmd)+'</td><td>'+esc(e.f.variation)+'</td><td><b>'+esc(revisedVal(e.f))+'</b></td>'+
   edCell(e,'reason',canEdit,!e.hyb.reason.pfn)+
   selCell(e,'rateVal',RATEVALS,canEdit)+
   edCell(e,'vendPQ',canEdit,!e.hyb.vendPQ.pfn)+
   '<td>'+esc(e.f.pendWith)+'</td>'+
   edCell(e,'resub',canEdit,!!e.resubComment)+
   (admin?'<td>'+esc(e.enteredBy)+'</td>':'')+`);
rep('V31 P2 legend',
`click a Rate / Reason / Resubmission cell to touch-up in place (pre-lock)`,
`click a PR Budget / Reason / Vendors &amp; PQ / Resubmission cell to touch-up in place, or set the dropdowns (pre-lock)`);

/* ---------- P3 snapshot ---------- */
rep('V32 cloneRow',
`function cloneRow(e){
  return { id:e.id, nfa:e.nfa, wt:e.wt, f:{...e.f},
    rate:hybFinal(e.hyb.rate), rateU:!e.hyb.rate.pfn, reason:hybFinal(e.hyb.reason), reasonU:!e.hyb.reason.pfn,
    resub:e.resubComment, files:e.files.map(f=>({...f})), initiator:e.initiator, enteredBy:e.enteredBy, touch:{...e.touch} };
}`,
`function cloneRow(e){
  return { id:e.id, nfa:e.nfa, wt:e.wt, f:{...e.f},
    prBudget:hybFinal(e.hyb.prBudget), prBudgetU:!e.hyb.prBudget.pfn, reason:hybFinal(e.hyb.reason), reasonU:!e.hyb.reason.pfn,
    vendPQ:hybFinal(e.hyb.vendPQ), vendPQU:!e.hyb.vendPQ.pfn, initBy:e.initBy||'', rateVal:e.rateVal||'',
    resub:e.resubComment, files:e.files.map(f=>({...f})), initiator:e.initiator, enteredBy:e.enteredBy, touch:{...e.touch} };
}`);
rep('V33 P3 colgroup',
`  let cols='<colgroup><col style="width:36px"><col style="width:82px"><col style="width:58px"><col style="width:66px"><col style="width:225px"><col style="width:62px"><col style="width:165px"><col style="width:74px"><col style="width:66px"><col style="width:66px"><col style="width:62px"><col style="width:210px"><col style="width:170px"><col style="width:190px"><col style="width:56px"><col style="width:86px"><col style="width:76px"><col style="width:82px"><col style="width:176px"><col style="width:155px"><col style="width:90px"><col style="width:185px"><col style="width:135px"></colgroup>';`,
`  let cols='<colgroup><col style="width:36px"><col style="width:60px"><col style="width:82px"><col style="width:56px"><col style="width:98px"><col style="width:88px"><col style="width:215px"><col style="width:60px"><col style="width:160px"><col style="width:88px"><col style="width:70px"><col style="width:66px"><col style="width:66px"><col style="width:72px"><col style="width:190px"><col style="width:112px"><col style="width:56px"><col style="width:84px"><col style="width:80px"><col style="width:172px"><col style="width:150px"><col style="width:185px"><col style="width:135px"></colgroup>';`);
rep('V34 P3 thead',
`  let thead='<tr><th>S.No</th><th>Project</th><th>Location</th><th>Appr. Note w/ PR</th><th>Description of Work</th><th>Duration</th><th>Vendor Name</th><th>Orig. Value ₹L (incl. GST)</th><th>Last Amend. ₹L</th><th>Amend. Value ₹L</th><th>Variation ₹L</th><th>Rate Per Unit</th><th>Reason</th><th>Reasonability of Rates</th><th>Vend. &amp; PQ</th><th>PR No.</th><th>NFA No.</th><th>Pending With</th><th>Remark from NFA Creator (resubmission)</th><th>Attached Files</th><th>NFA Initiator</th><th>MC Comments</th><th>MC Approval / Status</th></tr>';`,
`  let thead='<tr><th>S.No</th><th>PR No.</th><th>Project</th><th>Location</th><th>Creator</th><th>NFA Initiated By</th><th>Description of Work</th><th>Duration</th><th>Vendor Name</th><th>PR Budget Value ₹L</th><th>Orig. Value ₹L (incl. GST)</th><th>Last Amend. ₹L</th><th>This Variation ₹L</th><th>Revised Value ₹L</th><th>Reason for this New work/variation</th><th>Validation of Rates</th><th>Vendors &amp; PQ</th><th>NFA No.</th><th>Pending With</th><th>Remark from NFA Creator (resubmission)</th><th>Downloadable Files</th><th>MC Comments</th><th>MC Approval / Status</th></tr>';`);
rep('V35 p3Row cells',
`   '<td>'+sno+'</td><td>'+esc(r.f.project)+'</td><td>'+esc(r.f.location)+'</td><td>'+esc(r.f.apprNote)+'</td><td>'+esc(r.f.desc)+'</td><td>'+esc(r.f.duration)+'</td><td>'+esc(r.f.vendor)+'</td><td><b>'+esc(r.f.val)+'</b></td><td>'+esc(r.f.lastAmd)+'</td><td>'+esc(r.f.amdVal)+'</td><td>'+esc(r.f.variation)+'</td>'+
   '<td'+(r.rateU?' class="edit"':'')+'>'+(r.touch.rate?'<span class="redstar">*</span> ':'')+esc(r.rate)+'</td>'+
   '<td'+(r.reasonU?' class="edit"':'')+'>'+(r.touch.reason?'<span class="redstar">*</span> ':'')+esc(r.reason)+'</td>'+
   '<td>'+esc(r.f.reasonability)+'</td><td>'+esc(r.f.vendPQ)+'</td><td>'+esc(r.f.pr)+'</td><td class="nfa">'+esc(r.nfa)+initLine(r)+(r.relocated?'<div class="sub pmvchip">live entry relocated to '+r.relocated+' — decisions record to NFA history only</div>':'')+'</td><td>'+esc(r.f.pendWith)+'</td>'+
   '<td'+(r.resub?' class="edit"':'')+'>'+esc(r.resub||'—')+'</td>'+
   '<td>'+fileChips(r.files)+'</td>'+
   '<td>'+esc(r.initiator)+(r.initiator!==r.enteredBy?' <b class="redstar">*</b>':'')+'</td>'+`,
`   '<td>'+sno+'</td><td>'+esc(r.f.pr)+'</td><td>'+esc(r.f.project)+'</td><td>'+esc(r.f.location)+'</td>'+
   '<td>'+esc(r.initiator)+(r.initiator!==r.enteredBy?' <b class="redstar">*</b>':'')+'</td>'+
   '<td'+(r.touch.initBy?' class="yellowcell"':'')+'>'+(r.touch.initBy?'<span class="redstar">*</span> ':'')+esc(r.initBy||'—')+'</td>'+
   '<td>'+esc(r.f.desc)+'</td><td>'+esc(r.f.duration)+'</td><td>'+esc(r.f.vendor)+'</td>'+
   '<td'+(r.prBudgetU?' class="edit"':'')+'>'+(r.touch.prBudget?'<span class="redstar">*</span> ':'')+esc(r.prBudget)+'</td>'+
   '<td><b>'+esc(r.f.val)+'</b></td><td>'+esc(r.f.lastAmd)+'</td><td>'+esc(r.f.variation)+'</td><td><b>'+esc(revisedVal(r.f))+'</b></td>'+
   '<td'+(r.reasonU?' class="edit"':'')+'>'+(r.touch.reason?'<span class="redstar">*</span> ':'')+esc(r.reason)+'</td>'+
   '<td'+(r.touch.rateVal?' class="yellowcell"':'')+'>'+(r.touch.rateVal?'<span class="redstar">*</span> ':'')+esc(r.rateVal||'—')+'</td>'+
   '<td'+(r.vendPQU?' class="edit"':'')+'>'+(r.touch.vendPQ?'<span class="redstar">*</span> ':'')+esc(r.vendPQ)+'</td>'+
   '<td class="nfa">'+esc(r.nfa)+initLine(r)+(r.relocated?'<div class="sub pmvchip">live entry relocated to '+r.relocated+' — decisions record to NFA history only</div>':'')+'</td><td>'+esc(r.f.pendWith)+'</td>'+
   '<td'+(r.resub?' class="edit"':'')+'>'+esc(r.resub||'—')+'</td>'+
   '<td>'+fileChips(r.files)+'</td>'+`);

/* ---------- publish + PDF ---------- */
rep('V36 doPublish row mapping',
`    const rows=decided.map(r=>({wt:r.wt,nfa:r.nfa,project:r.f.project,loc:r.f.location,desc:r.f.desc,vendor:r.f.vendor,val:r.f.val,amdVal:r.f.amdVal,variation:r.f.variation,rate:r.rate,reason:r.reason,reasonability:r.f.reasonability,vendPQ:r.f.vendPQ,pr:r.f.pr,initDt:r.f.initDt,resub:r.resub,initiator:r.initiator,mcComment:s.mcC[r.id]||'',dec:s.dec[r.id].s}));`,
`    const rows=decided.map(r=>({wt:r.wt,nfa:r.nfa,project:r.f.project,loc:r.f.location,desc:r.f.desc,vendor:r.f.vendor,prBudget:r.prBudget,val:r.f.val,lastAmd:r.f.lastAmd,variation:r.f.variation,revised:revisedVal(r.f),reason:r.reason,rateVal:r.rateVal,vendPQ:r.vendPQ,pr:r.f.pr,initDt:r.f.initDt,resub:r.resub,initiator:r.initiator,mcComment:s.mcC[r.id]||'',dec:s.dec[r.id].s}));`);
rep('V37 PDF band colspan',
`    table+='<tr class="band"><td colspan="18">'+w+'. '+WT[w].toUpperCase()+'</td></tr>';`,
`    table+='<tr class="band"><td colspan="19">'+w+'. '+WT[w].toUpperCase()+'</td></tr>';`);
rep('V38 PDF row cells',
`    g.forEach((r,i)=>{ table+='<tr><td>'+(i+1)+'</td><td>'+esc(r.project)+'</td><td>'+esc(r.loc)+'</td><td>'+esc(r.desc)+'</td><td>'+esc(r.vendor)+'</td><td><b>'+esc(r.val)+'</b></td><td>'+esc(r.amdVal)+'</td><td>'+esc(r.variation)+'</td><td>'+esc(r.rate)+'</td><td>'+esc(r.reason)+'</td><td>'+esc(r.reasonability)+'</td><td>'+esc(r.vendPQ)+'</td><td>'+esc(r.pr)+'</td><td class="nfa">'+esc(r.nfa)+(fmtInit(r.initDt)?'<div style="font-weight:normal;font-size:6.9px">(Initiated on '+fmtInit(r.initDt)+')</div>':'')+'</td><td>'+esc(r.resub||'—')+'</td><td>'+esc(r.initiator)+'</td><td>'+esc(r.mcComment||'—')+'</td><td class="dec '+(r.dec==='APPROVED'?'ok':r.dec==='HOLD'?'hold':'rej')+'">'+r.dec+'</td></tr>'; });`,
`    g.forEach((r,i)=>{ table+='<tr><td>'+(i+1)+'</td><td>'+esc(r.project)+'</td><td>'+esc(r.loc)+'</td><td>'+esc(r.desc)+'</td><td>'+esc(r.vendor)+'</td><td>'+esc(r.prBudget||'—')+'</td><td><b>'+esc(r.val)+'</b></td><td>'+esc(r.lastAmd||'NA')+'</td><td>'+esc(r.variation)+'</td><td><b>'+esc(r.revised||'NA')+'</b></td><td>'+esc(r.reason)+'</td><td>'+esc(r.rateVal||'—')+'</td><td>'+esc(r.vendPQ)+'</td><td>'+esc(r.pr)+'</td><td class="nfa">'+esc(r.nfa)+(fmtInit(r.initDt)?'<div style="font-weight:normal;font-size:6.9px">(Initiated on '+fmtInit(r.initDt)+')</div>':'')+'</td><td>'+esc(r.resub||'—')+'</td><td>'+esc(r.initiator)+'</td><td>'+esc(r.mcComment||'—')+'</td><td class="dec '+(r.dec==='APPROVED'?'ok':r.dec==='HOLD'?'hold':'rej')+'">'+r.dec+'</td></tr>'; });`);
rep('V39 PDF colgroup',
`  '<table><colgroup><col style="width:22px"><col style="width:54px"><col style="width:36px"><col style="width:148px"><col style="width:104px"><col style="width:46px"><col style="width:44px"><col style="width:40px"><col style="width:148px"><col style="width:110px"><col style="width:124px"><col style="width:32px"><col style="width:54px"><col style="width:52px"><col style="width:116px"><col style="width:60px"><col style="width:120px"><col style="width:62px"></colgroup>'+`,
`  '<table><colgroup><col style="width:22px"><col style="width:54px"><col style="width:36px"><col style="width:142px"><col style="width:100px"><col style="width:44px"><col style="width:46px"><col style="width:44px"><col style="width:42px"><col style="width:46px"><col style="width:120px"><col style="width:72px"><col style="width:32px"><col style="width:52px"><col style="width:54px"><col style="width:112px"><col style="width:58px"><col style="width:116px"><col style="width:62px"></colgroup>'+`);
rep('V40 PDF thead',
`  '<tr><th>S.No</th><th>Project</th><th>Loc.</th><th>Description of Work</th><th>Vendor Name</th><th>Orig. Value ₹L (incl. GST)</th><th>Amend. Value ₹L</th><th>Variation ₹L</th><th>Rate Per Unit</th><th>Reason</th><th>Reasonability of Rates</th><th>Vend. &amp; PQ</th><th>PR No.</th><th>NFA No.</th><th>Remark from NFA Creator (resubmission)</th><th>NFA Initiator</th><th>MC Comments</th><th>MC Approval / Status</th></tr>'+table+'</table>'+`,
`  '<tr><th>S.No</th><th>Project</th><th>Loc.</th><th>Description of Work</th><th>Vendor Name</th><th>PR Budget ₹L</th><th>Orig. Value ₹L (incl. GST)</th><th>Last Amend. ₹L</th><th>This Variation ₹L</th><th>Revised Value ₹L</th><th>Reason</th><th>Validation of Rates</th><th>Vend. &amp; PQ</th><th>PR No.</th><th>NFA No.</th><th>Remark from NFA Creator (resubmission)</th><th>Creator</th><th>MC Comments</th><th>MC Approval / Status</th></tr>'+table+'</table>'+`);

fs.writeFileSync(OUT, html, 'utf8');
console.log('\\nAPPLIED '+applied+' patches → '+OUT+' ('+Buffer.byteLength(html,'utf8')+' bytes)');
