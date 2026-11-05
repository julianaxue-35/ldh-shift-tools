// FIV POS badge. (copied harness) animals with a Release location get a CPR Yes/No, kept in the frozen bar with the ID and weight; the booking sheet can carry it.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-fiv-sticky');
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
    t.ok(await page.$eval('#examStickyFiv', e => getComputedStyle(e).display) === 'none', 'no FIV badge by default');
    await page.evaluate(() => { state.animals[0].needs.fiv = true; saveShift(); openExam('a1'); });
    await page.waitForSelector('#fld_fivResult');
    await page.selectOption('#fld_fivResult', 'NEGATIVE');
    t.ok(await page.$eval('#examStickyFiv', e => getComputedStyle(e).display) === 'none', 'negative: no badge');
    await page.selectOption('#fld_fivResult', 'POSITIVE');
    await page.waitForTimeout(300);
    t.ok(await page.$eval('#examStickyFiv', e => getComputedStyle(e).display) !== 'none' && /FIV POS/.test(await page.textContent('#examStickyFiv')), 'positive: FIV POS badge shows in the frozen bar');
    t.ok(await page.$eval('#examStickyBar', e => getComputedStyle(e).position) === 'sticky' && /T-FIV/.test(await page.textContent('#examStickyBar')), 'and it sits in the sticky bar with the ID');
    await page.selectOption('#fld_fivResult', '');
    await page.waitForTimeout(300);
    t.ok(await page.$eval('#examStickyFiv', e => getComputedStyle(e).display) === 'none', 'cleared: badge goes');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})().catch(e => { console.error(e); process.exit(1); });
