// Estimated weight: tick it, doses use the estimate; record the actual later and doses switch; clear it to go back.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-estimated-weight');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([{ id: 'a1', animalId: 'T-FIV', species: 'cat', surgType: 'spey', weight: '4', location: 'CR1-7' }]));
    localStorage.setItem('ldh_surgery_shift_v1_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }));
  });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  try {
    await page.goto('file://' + path.resolve(__dirname, '../surgery.html'));
    await page.waitForTimeout(500);
    await page.evaluate(() => openExam('a1'));
    await page.waitForSelector('#fld_location');
    const st = () => page.evaluate(() => { const a = state.animals[0]; return { w: a.weight, est: a.weightEst, act: a.weightActual, ev: a.weightEstVal, lw: listWeightHtml(a), txt: weightNoteText(a) }; });
    t.ok(!(await page.$('#fld_weightActual')), 'no actual-weight box until the weight is marked as an estimate');
    await page.check('#fld_weightEst'); await page.waitForSelector('#fld_weightActual');
    let r = await st(); t.ok(r.est && r.w === '4' && /ESTIMATED/.test(r.txt) && /est\./.test(r.lw), 'ticked: 4kg is marked estimated in the note text and the list: ' + JSON.stringify(r));
    await page.fill('#fld_weightActual', '4.6'); await page.dispatchEvent('#fld_weightActual', 'change'); await page.waitForTimeout(200);
    r = await st(); t.ok(r.w === '4.6' && r.act === '4.6' && r.ev === '4' && /weighed; estimated 4kg earlier/.test(r.txt) && !/est\./.test(r.lw), 'actual recorded: doses use 4.6, estimate kept: ' + JSON.stringify(r));
    t.ok((await page.inputValue('#fld_weight')) === '4', 'the main box still shows the estimate');
    await page.fill('#fld_weightActual', ''); await page.dispatchEvent('#fld_weightActual', 'change'); await page.waitForTimeout(200);
    r = await st(); t.ok(r.w === '4' && r.act === '' && r.est, 'clearing the actual goes back to the estimate: ' + JSON.stringify(r));
    await page.uncheck('#fld_weightEst'); await page.waitForTimeout(200);
    r = await st(); t.ok(!r.est && r.w === '4' && !(await page.$('#fld_weightActual')), 'unticking returns to a normal weight');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})().catch(e => { console.error(e); process.exit(1); });

