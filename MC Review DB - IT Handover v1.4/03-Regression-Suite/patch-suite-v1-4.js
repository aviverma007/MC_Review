/* Adapts the v1-3 regression suite to prototype v1.4 (fixed page format) — match-count asserted. */
const fs = require('fs');
const SRC = 'mc-proto-v1-3-regression-suite-qa.js';
const OUT = 'mc-proto-v1-4-regression-suite-qa.js';
let js = fs.readFileSync(SRC, 'utf8');
let applied = 0;
function rep(name, from, to){
  const parts = js.split(from);
  if(parts.length !== 2) throw new Error('PATCH FAIL ['+name+'] — expected exactly 1 match, found '+(parts.length-1));
  js = parts.join(to);
  applied++;
  console.log('OK  '+name);
}

rep('S1 header',
`/* MC Review Dashboard — automated regression suite (v4, extends the 92-check v3 suite for build queue B1–B7)
 * Built against prototype v1.3. Run:
 *   npm i playwright && npx playwright install chromium
 *   node mc-proto-v1-3-regression-suite-qa.js [path-to-prototype.html]
 * Defaults to ./mc-review-dashboard-prototype-v1-3.html (or set MC_URL).`,
`/* MC Review Dashboard — automated regression suite (v5, extends the 146-check v4 suite for the fixed Page 1/2/3 format)
 * Built against prototype v1.4. Run:
 *   npm i playwright && npx playwright install chromium
 *   node mc-proto-v1-4-regression-suite-qa.js [path-to-prototype.html]
 * Defaults to ./mc-review-dashboard-prototype-v1-4.html (or set MC_URL).
 * v1.4 deltas covered (Excel format, 6 Jul): PfN editables PR Budget / Reason /
 * Vendors&PQ / Remarks · dropdowns "NFA initiated by" (C&P Team/Site) and
 * "Validation of Rates" (4 values) · computed Revised order value · Rate Per
 * Unit / Appr. Note / Reasonability dropped · Creator rename · Location + PR
 * No. on P2 · PDF format updated to match.`);

rep('S2 default target',
`  const target = process.env.MC_URL || 'file://'+path.resolve(process.argv[2]||'mc-review-dashboard-prototype-v1-3.html');`,
`  const target = process.env.MC_URL || 'file://'+path.resolve(process.argv[2]||'mc-review-dashboard-prototype-v1-4.html');`);

rep('S3 section U format asserts',
`  ok('P2 shows initiated date under NFA no.', (await row('14315').innerText()).includes('(Initiated on 24-Jun-2026)'));
  await page.click('#pageTabs button:nth-child(1)'); await W(240);`,
`  ok('P2 shows initiated date under NFA no.', (await row('14315').innerText()).includes('(Initiated on 24-Jun-2026)'));
  ok('FMT: Rate Per Unit column removed (P2)', await page.locator('th',{hasText:'Rate Per Unit'}).count()===0);
  ok('FMT: Validation of Rates + Location + PR Budget headers present', await page.locator('th',{hasText:'Validation of Rates'}).count()===1 && await page.locator('th',{hasText:'Location'}).count()===1 && await page.locator('th',{hasText:'PR Budget Value'}).count()===1);
  ok('FMT: Creator header replaces NFA Initiator', await page.locator('th',{hasText:'Creator'}).count()>=1 && await page.locator('th',{hasText:'NFA Initiator'}).count()===0);
  ok('FMT: revised order value computed (14319 → 24.76)', (await row('14319').innerText()).includes('24.76'));
  ok('FMT: no dropdown selects for view-only user', await page.locator('select.selcell').count()===0);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);`);

rep('S4 P1 editor format asserts',
`  ok('P1 initiated-on under NFA', (await row('14315').innerText()).includes('(Initiated on 24-Jun-2026)'));
  await row('14333').locator('td.nfa').click(); await W(180);`,
`  ok('P1 initiated-on under NFA', (await row('14315').innerText()).includes('(Initiated on 24-Jun-2026)'));
  ok('FMT: PR Budget PfN card in editor', await page.locator('.fcard h5',{hasText:'PR Budget Value'}).count()===1);
  ok('FMT: NFA Initiated By dropdown (C&P Team/Site)', (await page.locator('select.edsel[data-key="initBy"] option').allInnerTexts()).join('|').includes('C&P Team') && (await page.locator('select.edsel[data-key="initBy"] option').count())===3);
  ok('FMT: Validation of Rates dropdown (4 values)', (await page.locator('select.edsel[data-key="rateVal"] option').count())===5);
  await row('14333').locator('td.nfa').click(); await W(180);`);

rep('S5 P2 reviewer format asserts',
`  ok('B1: end-of-sheet marker on populated P2', (await page.locator('.endmark').innerText()).includes('- - x End of Sheet x - -'));
  await page.click('button:has-text("Lock sheet")'); await W(280);`,
`  ok('B1: end-of-sheet marker on populated P2', (await page.locator('.endmark').innerText()).includes('- - x End of Sheet x - -'));
  ok('FMT: 13594 revised = 31.99 on P2', (await row('13594').innerText()).includes('31.99'));
  await row('14315').locator('select.selcell[data-key="rateVal"]').selectOption('Rate analysis'); await W(280);
  ok('FMT: Validation dropdown set + touch-marked', (await row('14315').locator('select.selcell[data-key="rateVal"]').inputValue())==='Rate analysis' && (await row('14315').locator('.redstar').count())>=1);
  await page.click('button:has-text("Lock sheet")'); await W(280);`);

rep('S6 touch-up moves to reason',
`  const rc=row('13594').locator('.cellinput[data-key="rate"]');
  await caretEnd(rc); await page.keyboard.type(' - REVISED'); await rc.evaluate(el=>el.blur()); await W(300);
  ok('touch-up committed + red star', (await row('13594').locator('.cellinput[data-key="rate"]').innerText()).includes('REVISED') && (await row('13594').locator('.redstar').count())>=1);`,
`  const rc=row('13594').locator('.cellinput[data-key="reason"]');
  await caretEnd(rc); await page.keyboard.type(' - REVISED'); await rc.evaluate(el=>el.blur()); await W(300);
  ok('touch-up committed + red star', (await row('13594').locator('.cellinput[data-key="reason"]').innerText()).includes('REVISED') && (await row('13594').locator('.redstar').count())>=1);`);

rep('S7 PDF format asserts',
`  ok('B1: PDF carries no end-of-sheet marker', !pdf.includes('End of Sheet'));
  await popup.close();`,
`  ok('B1: PDF carries no end-of-sheet marker', !pdf.includes('End of Sheet'));
  ok('FMT: PDF new format columns', pdf.includes('Validation of Rates') && pdf.includes('Revised Value') && !pdf.includes('Rate Per Unit'));
  ok('FMT: PDF computed revised for 13594', pdf.includes('31.99'));
  await popup.close();`);

rep('S8 P2 initiated-date column assert exact-match (new "NFA Initiated By" is the dropdown, not the removed date column)',
`  ok('P2 has no separate NFA-Initiated column', await page.locator('th',{hasText:'NFA Initiated'}).count()===0);`,
`  ok('P2 has no separate NFA-Initiated date column', await page.locator('th').filter({hasText:/^NFA Initiated$/}).count()===0);`);

rep('S9 P3 initiated-date column assert exact-match',
`  ok('P3 has no NFA-Initiated column', await page.locator('th',{hasText:'NFA Initiated'}).count()===0);`,
`  ok('P3 has no NFA-Initiated date column', await page.locator('th').filter({hasText:/^NFA Initiated$/}).count()===0);`);

rep('S10 round-1 audit-fix regressions',
`  console.log(R.join('\\n'));
  console.log('CONSOLE/PAGE ERRORS:', errors.length?errors.join(' | '):'none');`,
`  /* 21 — Round-1 E2E-audit fix regressions */
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.click('button.stab:has-text("NFA Search")'); await W(200);
  await page.fill('#searchInp','359'); await page.press('#searchInp','Enter'); await W(300);
  const hist2=await page.locator('#app').innerText();
  ok('R1FIX: partial search surfaces registry history', hist2.includes('13594') && hist2.includes('HOLD') && hist2.includes('01-May-2026'));
  await page.fill('#searchInp','14319'); await page.press('#searchInp','Enter'); await W(300);
  ok('R1FIX: UNDECIDED styled neutral, not red', await page.locator('.st.pend',{hasText:'UNDECIDED'}).count()>=1);
  await page.fill('#searchInp','14350'); await page.press('#searchInp','Enter'); await W(300);
  ok('R1FIX: history rows carry their real index (MEP ghost + CIVIL sitting)', (await page.locator('tr',{hasText:'REJECTED'}).filter({hasText:'MEP'}).count())>=1 && (await page.locator('tr',{hasText:'APPROVED'}).filter({hasText:'CIVIL'}).count())>=1);
  /* hostile-named staged upload rides a pending ticket; same-values cancel salvages it */
  await page.click('button.stab:has-text("My Entries")'); await W(240);
  await page.click('button:has-text("Upload files")'); await W(120);
  await page.setInputFiles('#fileInput',{name:"O'Brien MEP quote.pdf",mimeType:'application/pdf',buffer:Buffer.from('pdf')}); await W(240);
  ok('R1FIX: hostile filename staged intact', (await page.locator('#stagedBox').innerText()).includes("O'Brien"));
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(8);
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','CIVIL'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(5);
  await page.click('button:has-text("Fetch from QMS")'); await W(380);
  const r50=await rowOn('14350','05-Jul-2026').innerText();
  ok('R1FIX: ticket-cancel salvages staged upload onto the entry', !r50.includes('Pending move') && r50.includes("O'Brien"));
  /* draft re-pull with differing values refuses a published target */
  await page.fill('#qeNfa','14344'); await page.selectOption('#qeIdx','CIVIL'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(10);
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  await page.fill('#qeNfa','14344');
  await page.click('#qeDateBtn'); await W(180); await pickDay(9);
  await page.click('button:has-text("Fetch from QMS")'); await W(300);
  ok('R1FIX: draft re-pull refuses published target date', await page.locator('.toast.err',{hasText:'published; the date is closed'}).count()>=1);
  ok('R1FIX: draft stayed on its original date', (await rowOn('14344','10-Jul-2026').innerText()).includes('Draft'));
  /* P2 sheet-date calendar now past-limited */
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(200);
  ok('R1FIX: P2 sheet-date calendar closes past days', (await page.locator('.calfoot').innerText()).includes('Selectable: 05-Jul-2026'));
  await page.mouse.click(30,400); await W(200);
  /* P4: generate skips manually-claimed slots; retired numbers refused on override */
  await page.selectOption('#roleSel','admin'); await W(240);
  await page.click('#pageTabs button:nth-child(4)'); await W(280);
  const g31b=row('14331');
  await g31b.locator('input.nfa[value^="ORD/"]').first().fill('ORD/MEP/0726-0039'); await g31b.locator('input.nfa[value^="ORD/"]').first().press('Tab'); await W(280);
  const g44=row('14344');
  await g44.locator('button[id^="gen"]').click(); await W(320);
  ok('R1FIX: generate skips the manually-claimed slot 0039', await page.locator('input.nfa[value="ORD/MEP/0726-0040"]').count()===1 && await page.locator('input.nfa[value="ORD/MEP/0726-0039"]').count()===1);
  await g44.locator('input.nfa[value^="ORD/"]').first().fill('ORD/MEP/0726-0036'); await g44.locator('input.nfa[value^="ORD/"]').first().press('Tab'); await W(280);
  ok('R1FIX: retired number refused on override', await page.locator('.toast.err',{hasText:'retired'}).count()>=1 && await page.locator('input.nfa[value="ORD/MEP/0726-0036"]').count()===0);
  /* role switch closes any open modal */
  await page.click('#auditBtn'); await W(240);
  ok('R1FIX setup: audit modal open', await page.locator('.modal').count()===1);
  await page.selectOption('#roleSel','user'); await W(280);
  ok('R1FIX: role switch closes the open modal', await page.locator('.modal').count()===0);

  console.log(R.join('\\n'));
  console.log('CONSOLE/PAGE ERRORS:', errors.length?errors.join(' | '):'none');`);

fs.writeFileSync(OUT, js, 'utf8');
console.log('\nAPPLIED '+applied+' patches → '+OUT);
