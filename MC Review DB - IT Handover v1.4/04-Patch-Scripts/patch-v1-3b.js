/* MC Review Dashboard — supplementary atomic patch for v1.3 (F13 omission)
 * Removes the Mode-B "link NFA no." control per Readiness v1.6 §5
 * ("Removed from scope: Mode-B link-NFA (F13 omission); Remarks breadcrumb
 * is the manual practice") and handoff §12 (no link-NFA re-introduction).
 * Applies in place on mc-review-dashboard-prototype-v1-3.html.
 */
const fs = require('fs');
const FILE = 'mc-review-dashboard-prototype-v1-3.html';
let html = fs.readFileSync(FILE, 'utf8');
let applied = 0;
function rep(name, from, to){
  const parts = html.split(from);
  if(parts.length !== 2) throw new Error('PATCH FAIL ['+name+'] — expected exactly 1 match, found '+(parts.length-1));
  html = parts.join(to);
  applied++;
  console.log('OK  '+name);
}

rep('F13a p1Row link removed',
`(e.mode==='B'?'<div class="sub">Manual · Mode B · <a class="lnk" onclick="event.stopPropagation();App.linkNfa('+e.id+')">Link NFA no.</a></div>':'')`,
`(e.mode==='B'?'<div class="sub">Manual · Mode B · interim reference (cite it in QMS at NFA initiation)</div>':'')`);

rep('F13b linkNfa/doLink handlers removed',
`  linkNfa(id){ const e=state.entries.find(x=>x.id===id);
    modal('<h3>Link real NFA number</h3><p style="font-size:12.5px">Once the regularising NFA exists in QMS, link it to <b>'+esc(e.nfa)+'</b>:</p><div class="mrow"><div class="field"><label>NFA number</label><input class="inp" id="lnkNo" placeholder="e.g. 14288"></div></div><div class="mfoot"><button class="btn ghost" onclick="App.closeModal()">Cancel</button><button class="btn primary" onclick="App.doLink('+id+')">Link</button></div>'); },
  doLink(id){ const v=document.getElementById('lnkNo').value.trim(); if(!v) return; const e=state.entries.find(x=>x.id===id); audit('NFA linked', e.nfa+' → '+v); e.nfa=e.nfa+' → '+v; closeModal(); render(); toast('Linked — trail updated'); },
`,
``);

rep('F13c Mode-B modal note',
`Interim reference is auto-issued (EM/MM-YY/NNN) — cite it in QMS at NFA initiation; link the real NFA number later.`,
`Interim reference is auto-issued (EM/MM-YY/NNN) — cite it in QMS at NFA initiation; the Remarks breadcrumb is the manual linking practice (F13 omitted).`);

rep('F13d p2Row flag text',
`e.mode==='B'?'<div>Mode B · link NFA pending</div>':''`,
`e.mode==='B'?'<div>Mode B · interim reference</div>':''`);

fs.writeFileSync(FILE, html, 'utf8');
console.log('\nAPPLIED '+applied+' patches in place → '+FILE+' ('+Buffer.byteLength(html,'utf8')+' bytes)');
