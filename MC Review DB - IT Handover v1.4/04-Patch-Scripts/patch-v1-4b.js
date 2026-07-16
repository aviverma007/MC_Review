/* v1.4 hotfix: calendar popup viewport clamping (bug: popup anchored to the
 * right-edge "Entry Date View" button overflowed the right screen edge —
 * present since v1.2). Clamps the 252px popup horizontally and flips it above
 * the anchor when there is no room below. Applies in place on v1-4.
 */
const fs = require('fs');
const FILE = 'mc-review-dashboard-prototype-v1-4.html';
let html = fs.readFileSync(FILE, 'utf8');
const from =
`  open(btn, val, cb){
    const LIM={p1:{min:TODAY},qe:{min:TODAY},mb:{min:TODAY},s3:{min:TODAY},mig:{min:TODAY,max:addDays(TODAY,10)}};
    const lim=LIM[cb]||{};
    const r=btn.getBoundingClientRect(); const dt=toDate(val)||toDate(TODAY);
    Cal.o={cb, val, min:lim.min||null, max:lim.max||null, y:dt.getFullYear(), m:dt.getMonth(), left:r.left+window.scrollX, top:r.bottom+window.scrollY+4};
    Cal.render();
  },`;
const to =
`  open(btn, val, cb){
    const LIM={p1:{min:TODAY},qe:{min:TODAY},mb:{min:TODAY},s3:{min:TODAY},mig:{min:TODAY,max:addDays(TODAY,10)}};
    const lim=LIM[cb]||{};
    const r=btn.getBoundingClientRect(); const dt=toDate(val)||toDate(TODAY);
    /* keep the popup on-screen: clamp the 252px width inside the right edge; flip above the anchor when no room below */
    const PW=252, PH=320, vw=document.documentElement.clientWidth, vh=window.innerHeight;
    let px=r.left; if(px+PW+8>vw) px=Math.max(8, vw-PW-8);
    let py=r.bottom+4; if(py+PH>vh && r.top-PH-4>0) py=r.top-PH-4;
    Cal.o={cb, val, min:lim.min||null, max:lim.max||null, y:dt.getFullYear(), m:dt.getMonth(), left:px+window.scrollX, top:py+window.scrollY};
    Cal.render();
  },`;
const parts = html.split(from);
if(parts.length !== 2) throw new Error('PATCH FAIL [Cal.open clamp] — expected exactly 1 match, found '+(parts.length-1));
fs.writeFileSync(FILE, parts.join(to), 'utf8');
console.log('OK  Cal.open viewport clamp applied → '+FILE);
