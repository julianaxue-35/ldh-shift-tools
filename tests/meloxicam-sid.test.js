// Meloxicam is always once daily: however it is typed, edited or picked, the chart is once daily.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('meloxicam-sid');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../medication-charts.html')); await page.waitForTimeout(500);
  const freq = s => page.evaluate(x => MedChart.parseMedPlan(x)[0].freq, s);
  for (const s of ['meloxicam 0.1ml PO once daily for 3 days', 'Meloxicam 0.1ml once a day with food x 3 days', 'meloxicam 0.1ml daily for 5 days', 'meloxicam 0.1ml q24h for 3 days', 'meloxicam 0.1ml once-daily for 3 days', 'metacam 0.1ml SID 3 days', 'meloxicam 0.1ml PO BID for 3 days', 'meloxicam 0.1ml'])
    t.ok(await freq(s) === 'SID', 'always once daily: ' + s);
  t.ok(await page.evaluate(() => /Meloxicam is once daily only/.test(MedChart.parseMedPlan('meloxicam 0.1ml PO BID for 3 days')[0].warnings.join('|'))), 'a typed BID is flagged');
  t.ok(await freq('gabapentin 0.25ml po bid for 4 days') === 'BID' && await freq('gabapentin 0.25ml twice daily for 3 days') === 'BID' && await freq('gabapentin q12h for 3 days') === 'BID', 'other drugs keep BID');
  t.ok(await freq('gabapentin 0.25ml once daily for 3 days') === 'SID' && await freq('gabapentin 0.25ml daily for 3 days') === 'SID' && await freq('gabapentin 0.25ml q24h for 3 days') === 'SID', 'once daily, daily and q24h are read as once daily');
  // a draft changed to BID by hand is still saved once daily
  const saved = await page.evaluate(() => {
    const meds = MedChart.parseMedPlan('meloxicam 0.1ml PO once daily for 3 days'); meds[0].freq = 'BID';
    const c = MedChart.addChart({ id: MedChart.uid(), sourceAnimalId: 'x', sourceTool: 'sick-injured', createdAt: new Date().toISOString(), animalId: 'M-1', species: 'dog', weight: '10', location: 'P1', vetInCharge: 'JX', problemList: '', startOption: 'tomorrow', meds });
    return [c.meds[0].freq, c.meds[0].labelText];
  });
  t.ok(saved[0] === 'SID' && /once daily/.test(saved[1]) && !/twice/.test(saved[1]), 'a BID picked by hand is saved once daily, label included: ' + saved[1]);
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
