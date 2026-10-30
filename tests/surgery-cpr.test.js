// Surgery tool: animals with a Release location get a CPR Yes/No, kept in the frozen bar with the ID and weight; the booking sheet can carry it.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-cpr');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([{ id: 'a1', animalId: 'T-CPR', species: 'cat', surgType: 'dental', weight: '4', location: 'CR1-7' }]));
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
    t.ok(!(await page.$('[data-cpr]')), 'no CPR question for a normal location');
    t.ok(!/CPR:/.test(await page.textContent('#examStickyId')), 'and nothing about CPR in the frozen bar');
    await page.fill('#fld_location', 'Release'); await page.dispatchEvent('#fld_location', 'change');
    await page.waitForSelector('[data-cpr]');
    t.ok(/T-CPR — 4 kg — CPR: not set/.test(await page.textContent('#examStickyId')), 'Release shows CPR: not set with ID and weight: ' + await page.textContent('#examStickyId'));
    await page.click('[data-cpr="YES"]'); await page.waitForSelector('[data-cpr].selected');
    t.ok(/T-CPR — 4 kg — CPR: YES/.test(await page.textContent('#examStickyId')), 'Yes appears in the frozen bar');
    await page.click('[data-cpr="NO"]'); await page.waitForSelector('[data-cpr="NO"].selected');
    t.ok(/CPR: NO/.test(await page.textContent('#examStickyId')) && (await page.evaluate(() => state.animals[0].cpr)) === 'NO', 'No replaces it and is saved');
    await page.fill('#fld_location', 'CR1-7'); await page.dispatchEvent('#fld_location', 'change');
    await page.waitForFunction(() => !document.querySelector('[data-cpr]'));
    t.ok(!/CPR:/.test(await page.textContent('#examStickyId')), 'leaving Release hides it again');
    const p = await page.evaluate(() => parseBookingSheet([['Shelter ID', 'Type', 'Species', 'Location', 'Procedure', 'CPR'], ['111', 'Shelter', 'Cat', 'Release', 'Spey', 'Yes'], ['222', 'Shelter', 'Cat', 'Release', 'Spey', 'n'], ['333', 'Shelter', 'Dog', 'P1', 'Castrate', '']].map(r => r)).map(r => r.cpr));
    t.ok(p.join('|') === 'YES|NO|', 'booking sheet CPR column is read: ' + p);
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
