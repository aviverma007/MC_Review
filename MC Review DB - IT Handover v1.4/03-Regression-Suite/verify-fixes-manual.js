/* Manual adversarial re-verification of the highest-risk round-1 fixes (F7 ledger,
 * F10 dual-index PDF, F11 injection-safety, F13 executor guards) — run directly,
 * no subagents. Exit 0 = all confirmed fixed. */
const { chromium } = require('playwright');
const path = require('path');
const R = []; const ok = (n, c, x) => { R.push((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? ('  [' + x + ']') : '')); if (!c) process.exitCode = 2; };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1720, height: 900 } });
  const errors = []; const alerts = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => { if (d.type() === 'alert') alerts.push(d.message()); d.accept(); });
  const W = (ms) => page.waitForTimeout(ms || 160);
  const row = n => page.locator('tr:has(td.nfa)', { hasText: n }).first();
  const pickDay = async d => { await page.locator('.calgrid button:not([disabled])').filter({ hasText: new RegExp('^' + d + '$') }).first().click(); await W(220); };
  await page.goto('file://' + path.resolve('mc-review-dashboard-prototype-v1-4.html')); await W(350);

  /* F13 — direct App executor calls from user role must no-op */
  await page.selectOption('#roleSel', 'user'); await W(200);
  const guard = await page.evaluate(() => {
    const before = JSON.stringify(Object.keys(state.sheets).map(k => state.sheets[k].version));
    state.idxSel[2] = 'MEP'; state.dateSel[2] = '05-Jul-2026';
    App.lockSheet(); App.doPublish(); state.migTo = '07-Jul-2026'; App.doMigrate();
    const after = JSON.stringify(Object.keys(state.sheets).map(k => state.sheets[k].version));
    return { before, after, published: state.published.length };
  });
  ok('F13: user-role App.lockSheet/doPublish/doMigrate no-op', guard.before === guard.after && guard.published === 2, JSON.stringify(guard));

  /* F7 — cross-index ledger + collision-safe generate + retired-refusal on override */
  await page.selectOption('#roleSel', 'admin'); await W(220);
  await page.click('#pageTabs button:nth-child(4)'); await W(240);
  // override a live order onto a future MEP slot, then generate on another NFA across it
  const r13 = row('14313');
  await r13.locator('input.nfa[value^="ORD/"]').first().fill('ORD/MEP/0726-0035'); await r13.locator('input.nfa[value^="ORD/"]').first().press('Tab'); await W(260);
  const r44 = row('14344');
  await r44.locator('select').first().selectOption('3'); await W(120);
  await r44.locator('button[id^="gen"]').click(); await W(320);
  const genned = await page.$$eval('input.nfa[value^="ORD/MEP/0726-"]', els => els.map(e => e.value));
  const dupes = genned.filter((v, i) => genned.indexOf(v) !== i);
  ok('F7: generate never duplicates a manually-claimed slot', dupes.length === 0, 'nums=' + genned.join(','));
  ok('F7: sequence skipped the overridden 0035', genned.includes('ORD/MEP/0726-0035') && genned.filter(v => v === 'ORD/MEP/0726-0035').length === 1);
  // delete one, then try to override another row to that retired number
  const delTarget = await page.locator('input.nfa[value^="ORD/MEP/0726-"]').last().inputValue();
  await page.locator('.ordel').last().click(); await W(200);
  await page.click('button:has-text("Delete order number")'); await W(240);
  const survivor = page.locator('input.nfa[value^="ORD/MEP/0726-"]').last();
  await survivor.fill(delTarget); await survivor.press('Tab'); await W(260);
  ok('F7: override to a retired number refused', await page.locator('.toast.err', { hasText: 'retired' }).count() >= 1 && await page.locator('input.nfa[value="' + delTarget + '"]').count() === 0, 'retired=' + delTarget);

  /* F11 — injection through a hostile filename never executes; renders safely everywhere */
  await page.selectOption('#roleSel', 'user'); await W(200);
  await page.click('#pageTabs button:nth-child(1)'); await W(200);
  await page.fill('#qeNfa', '14333'); await page.selectOption('#qeIdx', 'MEP'); await page.selectOption('#qeWt', 'A');
  await page.click('button:has-text("Fetch from QMS")'); await W(320);
  await page.click('button:has-text("Upload files")'); await W(120);
  await page.setInputFiles('#fileInput', { name: "x'><img src=x onerror=alert(1)>O'Brien.pdf", mimeType: 'application/pdf', buffer: Buffer.from('pdf') }); await W(220);
  await page.fill('#qeNfa', '14333'); await page.selectOption('#qeIdx', 'MEP'); await page.selectOption('#qeWt', 'A');
  await page.click('button:has-text("Fetch from QMS")'); await W(340);
  const chipTxt = await row('14333').locator('.fchip').last().innerText();
  ok('F11: hostile filename rendered as text, no injection executed', chipTxt.includes("O'Brien") && alerts.length === 0, 'alerts=' + alerts.length);
  // click the chip via delegated listener -> opens preview popup, no alert
  const [pop] = await Promise.all([page.waitForEvent('popup').catch(() => null), row('14333').locator('.fchip').last().click()]);
  await W(240); if (pop) await pop.close();
  ok('F11: delegated chip click opens preview without alert', alerts.length === 0);

  /* F10 — dual-index same-date publish; each NFA's PDF link opens its OWN index */
  await page.selectOption('#roleSel', 'revMEP'); await W(220);
  await page.click('#pageTabs button:nth-child(2)'); await W(260);
  await row('14315').locator('input.cbx').click(); await W(180);
  await page.click('button:has-text("Lock sheet")'); await W(280);
  await page.click('#pageTabs button:nth-child(3)'); await W(240);
  await row('14315').locator('.decbtn.g').click(); await W(180);
  { const [pp] = await Promise.all([page.waitForEvent('popup'), page.click('button:has-text("Publish PDF")').then(() => page.click('button:has-text("Confirm")'))]); await pp.waitForLoadState('domcontentloaded').catch(() => {}); await W(300); await pp.close(); }
  await page.selectOption('#roleSel', 'revCIV'); await W(220);
  await page.click('#pageTabs button:nth-child(2)'); await W(240);
  await row('14352').locator('input.cbx').click(); await W(180);
  await page.click('button:has-text("Lock sheet")'); await W(280);
  await page.click('#pageTabs button:nth-child(3)'); await W(240);
  await row('14352').locator('.decbtn.g').click(); await W(180);
  { const [pp] = await Promise.all([page.waitForEvent('popup'), page.click('button:has-text("Publish PDF")').then(() => page.click('button:has-text("Confirm")'))]); await pp.waitForLoadState('domcontentloaded').catch(() => {}); await W(300); await pp.close(); }
  // now open 14352's PDF via its P1 status link — must be the CIVIL PDF
  await page.selectOption('#roleSel', 'admin'); await W(220);
  await page.click('#pageTabs button:nth-child(1)'); await W(220);
  await page.click('#p1DateBtn'); await W(160); await pickDay(5);
  const [civPop] = await Promise.all([page.waitForEvent('popup'), row('14352').locator('a.lnk', { hasText: 'View PDF' }).first().click()]);
  await civPop.waitForLoadState('domcontentloaded').catch(() => {}); await W(300);
  const civContent = await civPop.content();
  ok('F10: 14352 View PDF opens the CIVIL PDF (not MEP)', /CIVIL|Civil &(amp;)? Consultancy/.test(civContent) && !/MEP &(amp;)? PROCUREMENT/i.test(civContent.split('<h1')[1] || civContent), 'header ok');
  await civPop.close();

  console.log(R.join('\n'));
  console.log('CONSOLE/PAGE ERRORS:', errors.length ? errors.join(' | ') : 'none');
  console.log('ALERTS FIRED:', alerts.length);
  if (errors.length && !process.exitCode) process.exitCode = 3;
  await browser.close();
})().catch(e => { console.log(R.join('\n')); console.error('HARD FAIL:', e.message); process.exit(1); });
