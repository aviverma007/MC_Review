/* MC Review Dashboard — atomic patch: round-2 E2E audit fixes (2 confirmed + 1 consistency polish)
 * G1 (F10 gap) P1 status-cell 'View PDF' resolves by the entry's own index+date, not the NFA's latest sitting.
 *   (Line 564 P2 resubmit-badge link intentionally left as openPdfFor — its badge text derives from flagInfo/latest, so they stay consistent.)
 * G2 (F12 gap) replacing a pending-move ticket accumulates the prior ticket's staged uploads instead of dropping them.
 * G3 (F2 family) Index/Work-Type strip selects clear their .err outline on change, mirroring the NFA-field fix.
 * Applies in place on mc-review-dashboard-prototype-v1-4.html. Match-count asserted, all-or-nothing.
 */
const fs = require('fs');
const FILE = 'mc-review-dashboard-prototype-v1-4.html';
let html = fs.readFileSync(FILE, 'utf8');
let applied = 0;
function rep(name, from, to){
  const parts = html.split(from);
  if(parts.length !== 2) throw new Error('PATCH FAIL ['+name+'] — expected exactly 1 match, found '+(parts.length-1));
  html = parts.join(to);
  applied++;
  console.log('OK  '+name);
}

/* G1 — F10 gap: decided-entry 'View PDF' opens the entry's OWN sitting (index+date), matching the outcome/date the cell shows */
rep('G1 status-cell View PDF index-aware',
`else statusCell='<span class="st '+(e.status==='APPROVED'?'ok':e.status==='HOLD'?'hold':'rej')+'">'+e.status+' · '+e.date+'</span><div class="sub"><a class="lnk" onclick="App.openPdfFor(\\''+e.nfa+'\\')">View PDF ↓</a> · locked</div>';`,
`else statusCell='<span class="st '+(e.status==='APPROVED'?'ok':e.status==='HOLD'?'hold':'rej')+'">'+e.status+' · '+e.date+'</span><div class="sub"><a class="lnk" onclick="App.openPdfByKey(\\''+e.index+'\\',\\''+e.date+'\\')">View PDF ↓</a> · locked</div>';`);

/* G2 — F12 gap: ticket replacement carries the earlier ticket's staged uploads forward */
rep('G2 ticket-replace accumulates staged',
`        const replacing=!!open.pmv;
        open.pmv={ index:idx, wt, date, f:{...q}, staged:state.staged.splice(0) };`,
`        const replacing=!!open.pmv;
        const carried=(open.pmv&&open.pmv.staged)?open.pmv.staged:[];
        open.pmv={ index:idx, wt, date, f:{...q}, staged:[...carried, ...state.staged.splice(0)] };`);
rep('G2b ticket-replace audit notes carried files',
`        audit('Pending move '+(replacing?'replaced':'staged'), nfa+' · '+shortRef(open.index,open.date)+' → '+shortRef(idx,date)+' (submit to apply)');`,
`        audit('Pending move '+(replacing?'replaced':'staged'), nfa+' · '+shortRef(open.index,open.date)+' → '+shortRef(idx,date)+' (submit to apply)'+(replacing&&carried.length?' · '+carried.length+' earlier staged file(s) carried forward':''));`);

/* G3 — F2 family: Index/WT strip selects self-clear their validation outline on change */
rep('G3a qeIdx onchange clears err',
`<label>Index <span class="req">*</span></label><select class="inp" id="qeIdx">`,
`<label>Index <span class="req">*</span></label><select class="inp" id="qeIdx" onchange="this.classList.remove(\\'err\\')">`);
rep('G3b qeWt onchange clears err',
`<label>Work Type <span class="req">*</span></label><select class="inp" id="qeWt">`,
`<label>Work Type <span class="req">*</span></label><select class="inp" id="qeWt" onchange="this.classList.remove(\\'err\\')">`);

fs.writeFileSync(FILE, html, 'utf8');
console.log('\\nAPPLIED '+applied+' fixes in place → '+FILE+' ('+Buffer.byteLength(html,'utf8')+' bytes)');
