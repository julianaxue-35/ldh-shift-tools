// The dental chart inside the Surgery exam must settle at its content height, not keep growing (it flashed and kept resizing).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('dental-embed-height');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');   // the framed dental page must not re-seed the shift list
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([{ id: 'a4', animalId: 'T-CAT', species: 'cat', surgType: 'dental', weight: '4' }]));
    localStorage.setItem('ldh_surgery_shift_v1_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }));
  });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  try {
    await page.goto('file://' + path.resolve(__dirname, '../surgery.html'));
    await page.waitForTimeout(500);
    await page.evaluate(() => openExam('a4'));
    await page.waitForSelector('#dentalFrame');
    const h = () => page.$eval('#dentalFrame', f => f.getBoundingClientRect().height);
    await page.waitForTimeout(1500);
    const h1 = await h();
    await page.waitForTimeout(2500);
    const h2 = await h();
    t.ok(h2 === h1, 'the dental frame has settled: ' + h1 + 'px then ' + h2 + 'px');
    t.ok(h1 >= 400 && h1 < 5000, 'and it is a sensible height: ' + h1);
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
