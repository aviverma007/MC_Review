/* MC Review Dashboard — automated regression suite (v5, extends the 146-check v4 suite for the fixed Page 1/2/3 format)
 * Built against prototype v1.4. Run:
 *   npm i playwright && npx playwright install chromium
 *   node mc-proto-v1-4-regression-suite-qa.js [path-to-prototype.html]
 * Defaults to ./mc-review-dashboard-prototype-v1-4.html (or set MC_URL).
 * v1.4 deltas covered (Excel format, 6 Jul): PfN editables PR Budget / Reason /
 * Vendors&PQ / Remarks · dropdowns "NFA initiated by" (C&P Team/Site) and
 * "Validation of Rates" (4 values) · computed Revised order value · Rate Per
 * Unit / Appr. Note / Reasonability dropped · Creator rename · Location + PR
 * No. on P2 · PDF format updated to match.
 * NOTE: assumes the prototype's frozen TODAY = 05-Jul-2026 and the seed data
 * described in the Claude Code handoff §9. Exit code 0 = all green
 * (2 = assert failure, 3 = console/page errors).
 * v1.3 deltas covered: B1 end-of-sheet marker · B2 submit-gated relocation
 * (pending-move ticket, O7 decided-gate, F8 publish guard, ghost marker,
 * published-mid-pending conversion) · B3 Entry Date View / Review Date
 * independence + today-view · B4 zero-decided warning + empty-snapshot
 * publish disabled · B5 locked-target migrate · B6 add-more Generate ·
 * B7 replace-by-name re-pull.
 */
const { chromium } = require('playwright');
const R=[]; function ok(n,c,x){ R.push((c?'PASS':'FAIL')+'  '+n+(x?('  ['+x+']'):'')); if(!c) process.exitCode=2; }
(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1720,height:900}});
  const errors=[];
  let lastDialog='';
  page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('dialog',d=>{ lastDialog=d.message(); d.accept(); });
  const W=ms=>page.waitForTimeout(ms||160);
  const row=n=>page.locator('tr:has(td.nfa)',{hasText:n}).first();
  const rowOn=(n,d)=>page.locator('tr:has(td.nfa)',{hasText:n}).filter({hasText:d}).first();
  const caretEnd=l=>l.evaluate(el=>{el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  const pickDay=async d=>{ await page.locator('.calgrid button:not([disabled])').filter({hasText:new RegExp('^'+d+'$')}).first().click(); await W(240); };

  const path=require('path');
  const target = process.env.MC_URL || 'file://'+path.resolve(process.argv[2]||'mc-review-dashboard-prototype-v1-4.html');
  await page.goto(target); await W(350);

  /* 0 — baseline: logo, stable appbar, black text, user gating */
  ok('appbar logo present', await page.locator('.appbar img[src^="data:image/png"]').count()===1);
  const h1=(await page.locator('.appbar').boundingBox()).height;
  ok('P1 date control lives on tab row (not appbar)', await page.locator('.subtabs #p1DateBtn').count()===1 && await page.locator('.appbar #p1DateBtn').count()===0);
  ok('inactive page-tab text is black', await page.$eval('.tab:not(.active)', el=>getComputedStyle(el).color)==='rgb(0, 0, 0)');
  ok('P3 tab disabled for user', await page.locator('#pageTabs button:nth-child(3)').isDisabled());
  await page.click('#pageTabs button:nth-child(4)'); await W(220);
  const h4=(await page.locator('.appbar').boundingBox()).height;
  ok('appbar height identical across pages', Math.abs(h1-h4)<1, h1+' vs '+h4);

  /* U — user view-only Page 2 */
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  ok('user can open Page 2', await page.locator('.tablewrap').count()>=1);
  ok('VIEW-ONLY badge shown', await page.locator('.viewbadge').count()===1);
  ok('Lock/Migrate hidden for user', await page.locator('button:has-text("Lock sheet")').count()===0 && await page.locator('button:has-text("Migrate")').count()===0);
  ok('Present-to-MC checkboxes disabled for user', await page.locator('.tablewrap input.cbx').first().isDisabled());
  ok('no editable cells for user', await page.locator('.cellinput[contenteditable="true"]').count()===0);
  ok('unselected rows read black (contrast)', await page.$eval('tr.rowdim td', el=>getComputedStyle(el).color)==='rgb(0, 0, 0)');
  ok('P2 has no separate NFA-Initiated date column', await page.locator('th').filter({hasText:/^NFA Initiated$/}).count()===0);
  ok('P2 shows initiated date under NFA no.', (await row('14315').innerText()).includes('(Initiated on 24-Jun-2026)'));
  ok('FMT: Rate Per Unit column removed (P2)', await page.locator('th',{hasText:'Rate Per Unit'}).count()===0);
  ok('FMT: Validation of Rates + Location + PR Budget headers present', await page.locator('th',{hasText:'Validation of Rates'}).count()===1 && await page.locator('th',{hasText:'Location'}).count()===1 && await page.locator('th',{hasText:'PR Budget Value'}).count()===1);
  ok('FMT: Creator header replaces NFA Initiator', await page.locator('th',{hasText:'Creator'}).count()>=1 && await page.locator('th',{hasText:'NFA Initiator'}).count()===0);
  ok('FMT: revised order value computed (14319 → 24.76)', (await row('14319').innerText()).includes('24.76'));
  ok('FMT: no dropdown selects for view-only user', await page.locator('select.selcell').count()===0);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);

  /* 1 — calendar: nav, past-disabled, empty state; B3 rename + strip persistence */
  ok('B3: tab-row control reads Entry Date View', (await page.locator('.p1datebox').innerText()).includes('Entry Date View'));
  ok('B3: strip control label reads Review Date', await page.locator('.qentry label',{hasText:'Review Date'}).count()===1);
  await page.click('#qeDateBtn'); await W(200);
  ok('calendar opens', await page.locator('.calpop').count()===1);
  ok('past days disabled (entry date, Jul-26)', await page.locator('.calgrid button:disabled').count()===4);
  await page.locator('.calnav select').nth(1).selectOption('2027'); await W(110);
  await page.locator('.calnav select').nth(0).selectOption('11'); await W(110);
  await page.screenshot({path:'r1-calendar.png'});
  await pickDay(15);
  ok('entry date → 15-Dec-2027', (await page.locator('#qeDateBtn').innerText()).includes('15-Dec-2027'));
  /* B3: the strip date now persists — bring it back to today for the fetch tests */
  await page.click('#qeDateBtn'); await W(180);
  await page.locator('.calnav select').nth(1).selectOption('2026'); await W(100);
  await page.locator('.calnav select').nth(0).selectOption('6'); await W(100);
  await pickDay(5);
  ok('B3: strip calendar re-pick returns to 05-Jul', (await page.locator('#qeDateBtn').innerText()).includes('05-Jul-2026'));
  await page.click('#p1DateBtn'); await W(180);
  await page.locator('.calnav select').nth(1).selectOption('2027'); await W(100);
  await page.locator('.calnav select').nth(0).selectOption('11'); await W(100);
  await pickDay(15);
  ok('P1 blank state for un-entered date', (await page.locator('.emptystate').innerText()).includes('No entries for 15-Dec-2027'));
  ok('B3: EDV change leaves strip date untouched', (await page.locator('#qeDateBtn').innerText()).includes('05-Jul-2026'));
  await page.click('#p1DateBtn'); await W(180);
  await page.locator('.calnav select').nth(1).selectOption('2026'); await W(100);
  await page.locator('.calnav select').nth(0).selectOption('6'); await W(100);
  await pickDay(5);
  ok('back to 05-Jul list', await page.locator('td.nfa',{hasText:'14315'}).count()===1);

  /* 2 — mandatory validation */
  await page.fill('#qeNfa','14333');
  await page.click('button:has-text("Fetch from QMS")'); await W(200);
  ok('mandatory toast', await page.locator('.toast.warn',{hasText:'mandatory'}).count()>=1);
  ok('index flagged red', await page.$eval('#qeIdx',el=>el.classList.contains('err')));

  /* 3 — fetch + initiated-on line */
  await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('button:has-text("Fetch from QMS")'); await W(350);
  ok('14333 populated', await page.locator('td.nfa',{hasText:'14333'}).count()===1);
  ok('P1 initiated-on under NFA', (await row('14315').innerText()).includes('(Initiated on 24-Jun-2026)'));
  ok('FMT: PR Budget PfN card in editor', await page.locator('.fcard h5',{hasText:'PR Budget Value'}).count()===1);
  ok('FMT: NFA Initiated By dropdown (C&P Team/Site)', (await page.locator('select.edsel[data-key="initBy"] option').allInnerTexts()).join('|').includes('C&P Team') && (await page.locator('select.edsel[data-key="initBy"] option').count())===3);
  ok('FMT: Validation of Rates dropdown (4 values)', (await page.locator('select.edsel[data-key="rateVal"] option').count())===5);
  await row('14333').locator('td.nfa').click(); await W(180);

  /* 4 — re-pull restores deleted attachment (B7: matching names replace in place) */
  const chips=()=>row('14315').locator('.fchip');
  const before=await chips().count();
  await chips().first().locator('.fx').click(); await W(200);
  await page.click('button:has-text("Deselect file")'); await W(240);
  ok('file deselected', (await chips().count())===before-1);
  await page.fill('#qeNfa','14315'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('button:has-text("Fetch from QMS")'); await W(380);
  ok('re-pull toast', await page.locator('.toast',{hasText:'re-pulled'}).count()>=1);
  ok('attachments restored', (await chips().count())===before);
  ok('B7: replace-by-name reported on re-pull', await page.locator('.toast',{hasText:'replaced by name'}).count()>=1);
  await row('14315').locator('td.nfa').click(); await W(160);

  /* 5 — upload staged → attach on re-pull */
  await page.click('button:has-text("Upload files")'); await W(120);
  await page.setInputFiles('#fileInput',{name:'Site_photo.png',mimeType:'image/png',buffer:Buffer.from('png')}); await W(240);
  ok('staged chip', (await page.locator('#stagedBox').innerText()).includes('Site_photo'));
  await page.fill('#qeNfa','14333'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  ok('upload attached (4 files)', (await row('14333').locator('.fchip').count())===4);
  await row('14333').locator('td.nfa').click(); await W(160);

  /* 6 — submit today + future */
  await row('14333').locator('input.cbx').first().click(); await W(150);
  await page.click('button:has-text("Submit")'); await W(300);
  ok('today submit toast', await page.locator('.toast',{hasText:'submitted'}).count()>=1);
  await page.click('#p1DateBtn'); await W(160); await pickDay(9);
  ok('09-Jul shows only its entries', (await page.locator('td.nfa',{hasText:'14350'}).count()===1)&&(await page.locator('td.nfa',{hasText:'14315'}).count()===0));
  await row('14350').locator('input.cbx').first().click(); await W(150);
  await page.click('button:has-text("Submit")'); await W(280);
  const st=row('14350').locator('td').last();
  ok('future status yellow', await st.evaluate(el=>el.classList.contains('yellowcell')));
  ok('future status text', (await st.innerText()).includes('future sheet'));
  await page.click('#p1DateBtn'); await W(160); await pickDay(5);
  ok('B3: today view lists the future 09-Jul entry too', await page.locator('tr:has(td.nfa)',{hasText:'14350'}).filter({hasText:'09-Jul-2026'}).count()===1);

  /* 6c — CIVIL bring-back migrate (09-Jul → today) with 10-day window */
  await page.selectOption('#roleSel','revCIV'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(9);
  ok('CIVIL 09-Jul sheet shows 14350', await page.locator('td.nfa',{hasText:'14350'}).count()===1);
  await page.click('button:has-text("Migrate sheet")'); await W(240);
  await page.click('#migToBtn'); await W(200);
  ok('migrate window: 11 selectable days', await page.locator('.calgrid button:not([disabled])').count()===11);
  ok('day today+11 disabled', await page.locator('.calgrid button:disabled').filter({hasText:/^16$/}).count()===1);
  await pickDay(5);
  await page.click('button:has-text("Migrate & merge")'); await W(320);
  ok('bring-back merged into today', (await page.locator('.sheethead').innerText()).includes('05-Jul-2026') && await page.locator('td.nfa',{hasText:'14350'}).count()===1 && await page.locator('td.nfa',{hasText:'14352'}).count()===1);

  /* 7 — MEP reviewer: zero-lock, isolation, v2, touch-up, v3 */
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(5);
  ok('MEP counter 0 of 10', (await page.locator('.counter').innerText()).includes('0 selected'));
  ok('B1: end-of-sheet marker on populated P2', (await page.locator('.endmark').innerText()).includes('- - x End of Sheet x - -'));
  ok('FMT: 13594 revised = 31.99 on P2', (await row('13594').innerText()).includes('31.99'));
  await row('14315').locator('select.selcell[data-key="rateVal"]').selectOption('Rate analysis'); await W(280);
  ok('FMT: Validation dropdown set + touch-marked', (await row('14315').locator('select.selcell[data-key="rateVal"]').inputValue())==='Rate analysis' && (await row('14315').locator('.redstar').count())>=1);
  await page.click('button:has-text("Lock sheet")'); await W(280);
  ok('zero-lock toast', await page.locator('.toast',{hasText:'empty selection'}).count()>=1);
  await page.click('#pageTabs button:nth-child(3)'); await W(280);
  ok('P3: No NFAs for review', (await page.locator('.emptystate').innerText()).includes('No NFAs for review'));
  ok('P3 has no NFA-Initiated date column', await page.locator('th').filter({hasText:/^NFA Initiated$/}).count()===0);
  ok('B4: publish disabled on empty snapshot', await page.locator('button:disabled',{hasText:'Publish PDF'}).count()===1);
  ok('B1: no marker on empty P3 snapshot', await page.locator('.endmark').count()===0);
  await page.click('#pageTabs button:nth-child(2)'); await W(240);
  await row('14315').locator('input.cbx').click(); await W(240);
  await page.click('#pageTabs button:nth-child(3)'); await W(240);
  ok('isolation: P3 still empty after P2 select', (await page.locator('.emptystate').innerText()).includes('No NFAs for review'));
  await page.click('#pageTabs button:nth-child(2)'); await W(240);
  for(let g=0;g<20;g++){ const un=page.locator('.tablewrap input.cbx:not([disabled]):not(:checked)'); if(await un.count()===0) break; await un.first().click(); await W(90); }
  await row('14355').locator('input.cbx').click(); await W(150);
  ok('P2 counter 9 of 10', (await page.locator('.counter').innerText()).includes('9 selected'));
  await page.click('button:has-text("Lock sheet")'); await W(300);
  ok('locked v2', (await page.locator('.lockstate').innerText()).includes('v2'));
  await page.click('#pageTabs button:nth-child(3)'); await W(280);
  ok('P3 v2: 9 rows', (await page.locator('tr:has(.decbtn)').count())===9);
  ok('B1: end-of-sheet marker on populated P3', (await page.locator('.endmark').innerText()).includes('- - x End of Sheet x - -'));
  await page.click('#pageTabs button:nth-child(2)'); await W(240);
  await row('14319').locator('input.cbx').click(); await W(200);
  const rc=row('13594').locator('.cellinput[data-key="reason"]');
  await caretEnd(rc); await page.keyboard.type(' - REVISED'); await rc.evaluate(el=>el.blur()); await W(300);
  ok('touch-up committed + red star', (await row('13594').locator('.cellinput[data-key="reason"]').innerText()).includes('REVISED') && (await row('13594').locator('.redstar').count())>=1);
  await page.click('#pageTabs button:nth-child(3)'); await W(240);
  ok('P3 v2 does not show touch-up', !(await row('13594').innerText()).includes('REVISED'));
  await page.click('#pageTabs button:nth-child(2)'); await W(240);
  await row('14319').locator('input.cbx').click(); await W(200);
  await page.click('button:has-text("Lock sheet")'); await W(300);
  ok('locked v3', (await page.locator('.lockstate').innerText()).includes('v3'));

  /* 7b — user re-enters a presented NFA on the locked sheet (same strip values → in-place re-pull) */
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.fill('#qeNfa','14306'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('button:has-text("Fetch from QMS")'); await W(380);
  ok('locked-sheet re-entry toast: auto-deselected', await page.locator('.toast',{hasText:'auto-deselected from Present to MC'}).count()>=1);
  await row('14306').locator('td.nfa').click(); await W(160);
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  ok('sheet stayed LOCKED v3', (await page.locator('.lockstate').innerText()).includes('SHEET LOCKED v3'));
  ok('counter dropped to 8 of 10', (await page.locator('.counter').innerText()).includes('8 selected'));
  ok('14306 arrives deselected + flagged', !(await row('14306').locator('input.cbx').isChecked()) && (await row('14306').innerText()).includes('held at bottom'));
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  ok('P3 snapshot v3 still shows 9 rows incl old 14306', (await page.locator('tr:has(.decbtn)').count())===9 && (await row('14306').innerText()).length>0);

  /* 8 — thumbs decisions + inline comment */
  for(const n of ['14315','14306','14331','13594','14333','EM/07-26/001']){
    await row(n).locator('.decbtn.g').click(); await W(150);
    ok('approve '+n, await row(n).locator('.decbtn.g.sel').count()===1);
  }
  await row('14401').locator('.decbtn.y').click(); await W(150);
  ok('hold 14401', await row('14401').locator('.decbtn.y.sel').count()===1);
  await row('14402').locator('.decbtn.r').click(); await W(150);
  ok('reject 14402', await row('14402').locator('.decbtn.r.sel').count()===1);
  await row('14306').locator('.decbtn.g').click(); await W(150);
  ok('toggle clears', await row('14306').locator('.decbtn.sel').count()===0);
  await row('14306').locator('.decbtn.g').click(); await W(150);
  ok('re-approve', await row('14306').locator('.decbtn.g.sel').count()===1);
  ok('counter 8 of 9', (await page.locator('.counter').innerText()).includes('8 of 9'));
  const mc=row('14331').locator('.cellinput[data-id]:not([data-key])');
  await mc.click(); await page.keyboard.press('Control+a');
  await page.keyboard.type('Release separate POs per vendor');
  await mc.evaluate(el=>el.blur()); await W(300);
  ok('inline MC comment persists', (await row('14331').locator('.cellinput[data-id]:not([data-key])').innerText()).includes('Release separate POs per vendor'));

  /* 9 — scroll */
  ok('no max-height trap', await page.$eval('.tablewrap',el=>getComputedStyle(el).maxHeight)==='none');
  const sc=await page.evaluate(()=>{window.scrollTo(0,document.body.scrollHeight);return{doc:document.documentElement.scrollHeight,win:innerHeight};});
  const lastVis=await page.locator('tr:has(.decbtn)').last().evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+2;});
  ok('bottom P3 row reachable', sc.doc>sc.win&&lastVis);
  await page.setViewportSize({width:2620,height:1000}); await W(200);
  await page.screenshot({path:'r2-p3.png',fullPage:true});
  await page.setViewportSize({width:1720,height:900}); await W(150);

  /* 10 — publish */
  await page.click('button:has-text("Publish PDF")'); await W(240);
  ok('modal lists undecided 14319', (await page.locator('.modal').innerText()).includes('14319'));
  const [popup]=await Promise.all([page.waitForEvent('popup'),page.click('button:has-text("Confirm")')]);
  await popup.waitForLoadState('domcontentloaded').catch(()=>{}); await W(400);
  const pdf=await popup.content();
  ok('PDF header', pdf.includes('MC REVIEW — MEP &amp; PROCUREMENT — 05-Jul-2026')||pdf.includes('MC REVIEW — MEP & PROCUREMENT — 05-Jul-2026'));
  ok('PDF undecided note', pdf.includes('Undecided')&&pdf.includes('14319'));
  ok('PDF re-presentation line', pdf.includes('Held/Rejected NFAs re-presentations require a fresh entry with mandatory resubmission comment'));
  ok('PDF confidentiality', pdf.includes('strictly prohibited without prior written approval'));
  ok('PDF initiated-on under NFA', pdf.includes('Initiated on 24-Jun-2026'));
  ok('PDF logo', pdf.includes('data:image/png'));
  ok('B1: PDF carries no end-of-sheet marker', !pdf.includes('End of Sheet'));
  ok('FMT: PDF new format columns', pdf.includes('Validation of Rates') && pdf.includes('Revised Value') && !pdf.includes('Rate Per Unit'));
  ok('FMT: PDF computed revised for 13594', pdf.includes('31.99'));
  await popup.close();

  /* 10b — closed-date error on published date */
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.fill('#qeNfa','14315'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('button:has-text("Fetch from QMS")'); await W(280);
  ok('published-date closed error', await page.locator('.toast.err',{hasText:'published; the date is closed'}).count()>=1);

  /* 10c — resubmission on next date; B3: fetch no longer jumps the Entry Date View */
  await page.click('#qeDateBtn'); await W(180); await pickDay(7);
  await page.fill('#qeNfa','14315');
  await page.click('button:has-text("Fetch from QMS")'); await W(380);
  ok('resubmission warning', await page.locator('.toast.warn',{hasText:'Previously presented'}).count()>=1);
  ok('B3: fetch does not jump the Entry Date View', (await page.locator('#p1DateBtn').innerText()).includes('05-Jul-2026'));
  ok('B3: fresh 07-Jul entry listed in today view', await page.locator('tr:has(td.nfa)',{hasText:'14315'}).filter({hasText:'07-Jul-2026'}).count()===1);
  await page.locator('.resub-card textarea').fill('Re-presented with revised advance terms.'); await W(120);
  await rowOn('14315','07-Jul-2026').locator('input.cbx').first().click(); await W(140);
  await page.click('button:has-text("Submit")'); await W(280);
  ok('resub submitted to 07-Jul sheet', await page.locator('.toast',{hasText:'submitted'}).count()>=1);

  /* 10d — migrate into a published date is blocked */
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(260);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(7);
  ok('07-Jul MEP sheet has the resub entry', await page.locator('td.nfa',{hasText:'14315'}).count()===1);
  await page.click('button:has-text("Migrate sheet")'); await W(240);
  ok('migrate default target = today', (await page.locator('#migToBtn').innerText()).includes('05-Jul-2026'));
  await page.click('button:has-text("Migrate & merge")'); await W(280);
  ok('published target blocked', await page.locator('.toast.err',{hasText:'published (closed)'}).count()>=1);
  await page.click('.modal button:has-text("Cancel")'); await W(160);

  /* 11 — P4: generate, uniqueness, delete with warning */
  await page.click('#pageTabs button:nth-child(4)'); await W(280);
  const r31=row('14331');
  ok('order count default 1', (await r31.locator('select').first().inputValue())==='1');
  ok('B6: first-generation button label', (await r31.locator('button[id^="gen"]').innerText()).includes('Generate order number'));
  await r31.locator('select').first().selectOption('3'); await W(110);
  await r31.locator('button:has-text("Generate order number")').click(); await W(300);
  const nos=page.locator('input.nfa[value^="ORD/MEP/0726-"]');
  ok('3 orders generated', (await nos.count())===3);
  const vin=page.locator('tr:has(input[value^="ORD/MEP/0726-"]) input[placeholder="Type vendor name…"]');
  const vend=['M/s Ascent Homes','M/s Vimal Probuild Pvt. Ltd.','M/s Oraa Enterprises'];
  for(let i=0;i<3;i++){ await vin.nth(i).fill(vend[i]); await vin.nth(i).press('Tab'); await W(110); }
  ok('vendor persisted', (await page.locator('tr:has(input[value^="ORD/MEP/0726-"]) input[placeholder="Type vendor name…"]').nth(0).inputValue())===vend[0]);
  const n1=await nos.nth(0).inputValue();
  await nos.nth(1).fill(n1); await nos.nth(1).press('Tab'); await W(280);
  ok('duplicate order rejected', await page.locator('.toast.err',{hasText:'unique'}).count()>=1);
  ok('clash reverted', (await page.locator('input.nfa[value^="ORD/MEP/0726-"]').nth(1).inputValue())!==n1);
  await page.locator('.ordel').last().click(); await W(220);
  ok('delete warning modal', (await page.locator('.modal').innerText()).includes('deleting order number'));
  await page.click('button:has-text("Delete order number")'); await W(280);
  ok('order deleted (2 remain)', (await page.locator('input.nfa[value^="ORD/MEP/0726-"]').count())===2);
  ok('delete toast', await page.locator('.toast',{hasText:'retired'}).count()>=1);
  await page.screenshot({path:'r3-p4.png'});

  /* 12 — admin */
  await page.selectOption('#roleSel','admin'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  ok('Entered By admin-only', await page.locator('th',{hasText:'Entered By'}).count()===1);
  await page.click('#auditBtn'); await W(240);
  const at=await page.locator('.modal').innerText();
  ok('audit: auto-deselect + order delete + migrate + publish', at.includes('auto-deselected')&&at.includes('Order number deleted')&&at.includes('Bulk migrate')&&at.includes('PUBLISHED'));
  await page.click('.modal button:has-text("Close")'); await W(150);

  /* 13 — user history + statuses */
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.click('#p1DateBtn'); await W(160); await pickDay(5);
  ok('re-entered 14306 closed with sitting decision', (await row('14306').innerText()).includes('APPROVED'));
  await page.click('button.stab:has-text("Published PDFs")'); await W(240);
  ok('PDF library rows', (await page.locator('.tablewrap tr').count())===4);
  await page.click('button.stab:has-text("NFA Search")'); await W(200);
  await page.fill('#searchInp','13594'); await page.press('#searchInp','Enter'); await W(300);
  const hist=await page.locator('#app').innerText();
  ok('search timeline', hist.includes('HOLD')&&hist.includes('01-May-2026')&&hist.includes('APPROVED'));

  /* ============ v1.3 EXTENSIONS — B1–B7 ============ */

  /* 14 — B3: Entry Date View ↔ Review Date full independence */
  await page.click('button.stab:has-text("My Entries")'); await W(240);
  ok('B3: strip date persisted through session (07-Jul from 10c)', (await page.locator('#qeDateBtn').innerText()).includes('07-Jul-2026'));
  await page.click('#p1DateBtn'); await W(180); await pickDay(9);
  ok('B3: EDV → 09-Jul leaves strip on 07-Jul', (await page.locator('#p1DateBtn').innerText()).includes('09-Jul-2026') && (await page.locator('#qeDateBtn').innerText()).includes('07-Jul-2026'));
  await page.click('#qeDateBtn'); await W(180); await pickDay(8);
  ok('B3: strip → 08-Jul leaves EDV on 09-Jul', (await page.locator('#qeDateBtn').innerText()).includes('08-Jul-2026') && (await page.locator('#p1DateBtn').innerText()).includes('09-Jul-2026'));
  await page.click('#p1DateBtn'); await W(180); await pickDay(5);
  ok('B3: today view aggregates open entries across dates', await page.locator('tr:has(td.nfa)',{hasText:'14315'}).filter({hasText:'07-Jul-2026'}).count()===1);

  /* 15 — B2: pending-move ticket lifecycle (14350: CIVIL·05-Jul submitted → MEP) */
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('button:has-text("Fetch from QMS")'); await W(380);   /* strip date = 08-Jul → differing */
  ok('B2: pending-move chip text', (await row('14350').innerText()).includes('Pending move from CIVIL·05-Jul — submit to apply · previous entry still on Page 2'));
  ok('B2: one P1 row, pending values shown', await page.locator('tr:has(td.nfa)',{hasText:'14350'}).count()===1 && (await row('14350').innerText()).includes('08-Jul-2026'));
  ok('B2: ticket checkbox pre-ticked', await row('14350').locator('input.cbx').first().isChecked());
  await page.selectOption('#roleSel','revCIV'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(5);
  ok('B2: at fetch nothing changes on Page 2 — old row still present', await page.locator('td.nfa',{hasText:'14350'}).count()===1);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(6);
  ok('B1: no marker on empty P2 sheet', await page.locator('.endmark').count()===0 && (await page.locator('.emptystate').innerText()).includes('No submitted entries'));
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  /* cancel by same-values fetch */
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','CIVIL'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(5);
  await page.click('button:has-text("Fetch from QMS")'); await W(380);
  ok('B2: same-values fetch cancels the ticket (normal re-pull)', !(await row('14350').innerText()).includes('Pending move') && await page.locator('.toast',{hasText:'re-pulled'}).count()>=1);
  /* re-stage, then replace with a newer differing fetch */
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','MEP'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(8);
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  await page.fill('#qeNfa','14350');
  await page.click('#qeDateBtn'); await W(180); await pickDay(7);
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  ok('B2: newer differing fetch replaces the ticket', (await row('14350').innerText()).includes('07-Jul-2026') && (await row('14350').innerText()).includes('Pending move from CIVIL·05-Jul'));
  /* atomic swap on Submit — target MEP·07-Jul is unlocked */
  await page.click('button:has-text("Submit")'); await W(340);
  ok('B2: relocation toast on Submit', await page.locator('.toast',{hasText:'relocated'}).count()>=1);
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(7);
  ok('B2: atomic swap — entry arrived on MEP·07-Jul deselected', await page.locator('td.nfa',{hasText:'14350'}).count()===1 && !(await row('14350').locator('input.cbx').isChecked()));
  await page.selectOption('#roleSel','revCIV'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(5);
  ok('B2: P2-uniqueness — old sheet no longer holds the entry', await page.locator('td.nfa',{hasText:'14350'}).count()===0);

  /* 16 — B2/O7: decided-gate refusal → operator toggle-clear → Submit passes; ghost marker; F8 */
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(7);
  for(let g=0;g<10;g++){ const un=page.locator('.tablewrap input.cbx:not([disabled]):not(:checked)'); if(await un.count()===0) break; await un.first().click(); await W(90); }
  await page.click('button:has-text("Lock sheet")'); await W(300);
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(7);
  await row('14350').locator('.decbtn.g').click(); await W(200);
  ok('O7 setup: 14350 presented + decided on MEP·07-Jul', await row('14350').locator('.decbtn.g.sel').count()===1);
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','CIVIL'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(9);
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  await page.click('button:has-text("Submit")'); await W(340);
  ok('B2/O7: decided-gate refusal message', await page.locator('.toast.err',{hasText:'already reviewed in MC'}).count()>=1);
  ok('B2/O7: ticket retained after refusal', (await row('14350').innerText()).includes('Pending move'));
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  await row('14350').locator('.decbtn.g').click(); await W(200);   /* same-click clears the decision */
  ok('O7: operator cleared the decision', await row('14350').locator('.decbtn.sel').count()===0);
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.click('button:has-text("Submit")'); await W(340);
  ok('B2/O7: after operator clear, the pending Submit passes', await page.locator('.toast',{hasText:'relocated'}).count()>=1);
  await page.selectOption('#roleSel','revMEP'); await W(240);
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  ok('B2: departed snapshot row carries the relocated marker', (await row('14350').innerText()).includes('live entry relocated to CIVIL·09-Jul'));
  await row('14350').locator('.decbtn.r').click(); await W(200);   /* decision on ghost → history only */
  await row('14315').locator('.decbtn.g').click(); await W(200);
  await page.click('button:has-text("Publish PDF")'); await W(240);
  const [popup2]=await Promise.all([page.waitForEvent('popup'),page.click('button:has-text("Confirm")')]);
  await popup2.waitForLoadState('domcontentloaded').catch(()=>{}); await W(300);
  await popup2.close();
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  const live50=await rowOn('14350','09-Jul-2026').innerText();
  /* status stays open-Submitted; the ghost REJECTED lands in NFA history only (a D6 resubmit-history chip may cite it) */
  ok('B2/F8: publish left the relocated live entry untouched', live50.includes('Submitted → Page 2') && !live50.includes('View PDF'));

  /* 17 — B2: old date published mid-pending → fresh-entry path with mandatory resub comment */
  await page.fill('#qeNfa','14350'); await page.selectOption('#qeIdx','CIVIL'); await page.selectOption('#qeWt','A');
  await page.click('#qeDateBtn'); await W(180); await pickDay(10);
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  ok('B2: ticket staged CIVIL·09-Jul → CIVIL·10-Jul', (await row('14350').innerText()).includes('Pending move from CIVIL·09-Jul'));
  await page.selectOption('#roleSel','revCIV'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(9);
  await row('14350').locator('input.cbx').click(); await W(200);
  await page.click('button:has-text("Lock sheet")'); await W(300);
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(9);
  await row('14350').locator('.decbtn.g').click(); await W(200);
  await page.click('button:has-text("Publish PDF")'); await W(240);
  const [popup3]=await Promise.all([page.waitForEvent('popup'),page.click('button:has-text("Confirm")')]);
  await popup3.waitForLoadState('domcontentloaded').catch(()=>{}); await W(300);
  await popup3.close();
  await page.selectOption('#roleSel','user'); await W(240);
  await page.click('#pageTabs button:nth-child(1)'); await W(240);
  await page.click('button:has-text("Submit")'); await W(340);
  ok('B2: published-mid-pending converts to fresh entry', await page.locator('.toast.warn',{hasText:'fresh entry'}).count()>=1);
  ok('B2: resubmission comment demanded (resub card open)', await page.locator('.resub-card textarea').count()===1);
  await page.click('button:has-text("Submit")'); await W(300);
  ok('B2: submit blocked while resub comment empty', await page.locator('.toast.err',{hasText:'resubmission comment is mandatory'}).count()>=1);
  await page.locator('.resub-card textarea').fill('Re-presented after 09-Jul sitting closed mid-move.'); await W(120);
  await page.click('button:has-text("Submit")'); await W(300);
  const fresh50=await rowOn('14350','10-Jul-2026').innerText();
  ok('B2: fresh entry submitted to CIVIL·10-Jul', fresh50.includes('Submitted') && fresh50.includes('future sheet'));

  /* 18 — B4: zero-decided warning; empty-snapshot publish disabled (CIVIL·05-Jul, 14352) */
  await page.selectOption('#roleSel','revCIV'); await W(240);
  await page.click('#pageTabs button:nth-child(2)'); await W(280);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(5);
  await row('14352').locator('input.cbx').click(); await W(200);
  await page.click('button:has-text("Lock sheet")'); await W(300);
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(5);
  await page.click('button:has-text("Publish PDF")'); await W(240);
  ok('B4: zero-decided warning text', (await page.locator('.modal').innerText()).includes('0 decided — publishing will expire all 1 presented entries.'));
  await page.click('button:has-text("Back to meeting")'); await W(200);
  await page.click('#pageTabs button:nth-child(2)'); await W(260);
  await row('14352').locator('input.cbx').click(); await W(240);   /* deselect → unlock */
  await page.click('button:has-text("Lock sheet")'); await W(300); /* zero-selection lock */
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  ok('B4: empty snapshot — Publish disabled entirely', await page.locator('button:disabled',{hasText:'Publish PDF'}).count()===1 && (await page.locator('.emptystate').innerText()).includes('No NFAs for review'));

  /* 19 — B5: migrate into a locked target (CIVIL·10-Jul → locked CIVIL·05-Jul) */
  await page.click('#pageTabs button:nth-child(2)'); await W(260);
  await page.locator('.sheethead .calbtn').click(); await W(180); await pickDay(10);
  ok('B5 setup: CIVIL·10-Jul holds the fresh 14350', await page.locator('td.nfa',{hasText:'14350'}).count()===1);
  await page.click('button:has-text("Migrate sheet")'); await W(240);
  ok('B5: bring-back default target = today', (await page.locator('#migToBtn').innerText()).includes('05-Jul-2026'));
  await page.click('button:has-text("Migrate & merge")'); await W(340);
  ok('B5: locked-target migrate allowed, toast notes deselected arrival', await page.locator('.toast',{hasText:'deselected on a locked sheet'}).count()>=1);
  ok('B5: target lock untouched', (await page.locator('.lockstate').innerText()).includes('SHEET LOCKED v2'));
  ok('B5: arrival lands deselected + held', !(await row('14350').locator('input.cbx').isChecked()) && (await row('14350').innerText()).includes('held at bottom'));
  await page.click('#pageTabs button:nth-child(3)'); await W(260);
  ok('B5: target snapshot untouched (still the empty v2)', (await page.locator('.emptystate').innerText()).includes('No NFAs for review'));

  /* 20 — B6: add-more Generate; B7 + B2 audit lines */
  await page.selectOption('#roleSel','admin'); await W(240);
  await page.click('#pageTabs button:nth-child(4)'); await W(280);
  const g31=row('14331');
  ok('B6: button reads Add 1 more order after first generation', (await g31.locator('button[id^="gen"]').innerText()).includes('Add 1 more order'));
  await g31.locator('select').first().selectOption('2'); await W(150);
  ok('B6: label tracks the selected count', (await g31.locator('button[id^="gen"]').innerText()).includes('Add 2 more orders'));
  lastDialog='';
  await g31.locator('button[id^="gen"]').click(); await W(340);
  ok('B6: one-line confirm shown and accepted', lastDialog.includes('Add 2 more order'));
  ok('B6: rows appended, existing rows untouched', (await page.locator('input.nfa[value^="ORD/MEP/0726-"]').count())===4);
  await page.click('#auditBtn'); await W(240);
  const at2=await page.locator('.modal').innerText();
  ok('B7: replace-by-name audit line', at2.includes('replaced by name'));
  ok('B2: relocation audited with both sides named', at2.includes('CIVIL·05-Jul → MEP·07-Jul (submit-gated)'));
  ok('B2: O7 conversion audited', at2.includes('published mid-pending'));
  await page.click('.modal button:has-text("Close")'); await W(150);

  /* 21 — Round-1 E2E-audit fix regressions */
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

  console.log(R.join('\n'));
  console.log('CONSOLE/PAGE ERRORS:', errors.length?errors.join(' | '):'none');
  if(errors.length && !process.exitCode) process.exitCode=3;
  await browser.close();
})().catch(e=>{ console.log(R.join('\n')); console.error('HARD FAIL:',e.message); process.exit(1); });
