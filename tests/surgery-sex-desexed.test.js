// Surgery tool: Sex can be Male / Female entire or Male / Female desexed, and a booking sheet saying "neutered" / "spayed" is understood.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-sex-desexed');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');   // the framed dental page must not re-seed the shift list
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([{ id: 'a1', animalId: 'T-SEX', species: 'cat', surgType: 'dental', weight: '4' }]));
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
    await page.waitForSelector('#fld_sex');
    const opts = await page.$$eval('#fld_sex option', os => os.map(o => o.textContent.trim()));
    t.ok(opts.join('|') === '-|Male entire|Female entire|Male desexed|Female desexed', 'Sex offers entire and desexed for both: ' + opts);
    await page.selectOption('#fld_sex', 'Female desexed');
    await page.waitForSelector('#fld_sex');
    t.ok((await page.$eval('#fld_sex', e => e.value)) === 'Female desexed' && (await page.evaluate(() => state.animals[0].sex)) === 'Female desexed', 'Female desexed is kept after choosing it');
    t.ok(/Sex: Female desexed/.test(await page.evaluate(() => assembleNote(state.animals[0]))), 'and it is written in the note');
    await page.selectOption('#fld_sex', 'Male desexed');
    t.ok((await page.evaluate(() => state.animals[0].sex)) === 'Male desexed', 'Male desexed too');
    const m = await page.evaluate(() => ['Male', 'M', 'Female', 'F', 'Male neutered', 'Male - desexed', 'Female (spayed)', 'Female spayed', 'Male castrated', 'unknown'].map(matchSex));
    t.ok(m.join('|') === 'Male entire|Male entire|Female entire|Female entire|Male desexed|Male desexed|Female desexed|Female desexed|Male desexed|', 'booking-sheet words are understood: ' + m.join('|'));
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
