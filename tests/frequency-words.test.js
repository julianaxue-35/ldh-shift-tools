// BID = twice daily, SID = once daily, EOD = every other day (typed as letters or spelled out), on the chart and in every picker.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('frequency-words');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../medication-charts.html')); await page.waitForTimeout(400);
  const P = s => page.evaluate(x => { const r = MedChart.parseMedPlan(x)[0]; return [r.freq, r.days, r.labelText]; }, s);
  const cases = [
    ['gabapentin 0.25ml po BID for 4 days', 'BID'], ['gabapentin 0.25ml twice daily for 4 days', 'BID'], ['gabapentin 0.25ml twice a day x 4 days', 'BID'], ['gabapentin 0.25ml q12h for 4 days', 'BID'],
    ['gabapentin 0.25ml po SID for 4 days', 'SID'], ['gabapentin 0.25ml once daily for 4 days', 'SID'], ['gabapentin 0.25ml once a day for 4 days', 'SID'], ['gabapentin 0.25ml daily for 4 days', 'SID'],
    ['gabapentin 0.25ml po EOD for 6 days', 'EOD'], ['gabapentin 0.25ml every other day for 6 days', 'EOD'], ['gabapentin 0.25ml every second day for 6 days', 'EOD'], ['gabapentin 0.25ml q48h for 6 days', 'EOD'], ['gabapentin 0.25ml on alternate days for 6 days', 'EOD']
  ];
  for (const [s, want] of cases) t.ok((await P(s))[0] === want, want + ': ' + s);
  t.ok((await P('gabapentin 0.25ml PO BID x 14 days'))[1] === 14 && (await P('gabapentin 0.25ml PO SID for 2 weeks'))[1] === 14, 'the number of days is read from "x 14 days" and "for 2 weeks" as well as "for 4 days"');
  t.ok(/twice daily/.test((await P('gabapentin 0.25ml BID for 4 days'))[2]) && /once daily/.test((await P('gabapentin 0.25ml SID for 4 days'))[2]) && /every other day/.test((await P('gabapentin 0.25ml EOD for 6 days'))[2]), 'the label spells them out: twice daily / once daily / every other day');
  t.ok((await P('meloxicam 0.1ml EOD for 6 days'))[0] === 'SID', 'meloxicam stays once daily even if EOD is typed');
  // the chart grid: EOD circles every second day
  const grid = await page.evaluate(() => MedChart.computeGrid({ freq: 'EOD', days: 6, startSlot: 'AM' }, 1));
  t.ok(grid.am.join('|') === '|◯||◯||◯||R/C||||||' && grid.pm.every(x => x === ''), 'EOD is charted on days 1, 3 and 5 only, recheck on day 7: ' + grid.am.join('|'));
  // a rabbit's meloxicam from the Surgery tool is twice daily on purpose and is left alone
  const saved = await page.evaluate(() => {
    const mk = species => { const meds = MedChart.parseMedPlan('meloxicam 0.1ml PO once daily for 3 days'); meds[0].freq = 'BID'; return MedChart.addChart({ id: MedChart.uid(), sourceAnimalId: species, sourceTool: 'surgery', createdAt: new Date().toISOString(), animalId: species, species, weight: '2', location: 'S1', vetInCharge: 'JX', problemList: '', startOption: 'tomorrow', meds }).meds[0].freq; };
    return [mk('rabbit'), mk('dog')];
  });
  t.ok(saved[0] === 'BID' && saved[1] === 'SID', 'a rabbit keeps twice-daily meloxicam, a dog is once daily: ' + saved.join());
  // the picker on the Medication Charts page (edit and new chart) offers all three
  await page.evaluate(() => { const meds = MedChart.parseMedPlan('gabapentin 0.25ml po BID for 4 days'); MedChart.saveCharts([{ id: 'c1', sourceAnimalId: 'x', sourceTool: 'surgery', createdAt: new Date().toISOString(), animalId: 'F-1', species: 'dog', weight: '10', location: 'P1', vetInCharge: 'JX', problemList: '', startOption: 'tomorrow', meds }]); });
  await page.reload(); await page.waitForSelector('[data-chartid="c1"]');
  await page.click('[data-edit="c1"]');
  const vals = await page.$$eval('input[name^="ec_freq_"]', rs => rs.map(r => r.value));
  t.ok(vals.join() === 'SID,BID,EOD', 'the Edit form offers SID, BID and EOD: ' + vals.join());
  await page.check('input[name="ec_freq_0"][value="EOD"]');
  await page.click('#ec_saveBtn');
  await page.waitForTimeout(300);
  const f = await page.evaluate(() => MedChart.loadCharts()[0].meds[0].freq + '|' + MedChart.aaChartLines(MedChart.loadCharts()[0])[0]);
  t.ok(/^EOD\|/.test(f) && /every other day/.test(f), 'picking EOD and saving charts it every other day: ' + f.slice(0, 70));
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  // the three shift tools offer it too
  for (const file of ['sick-injured.html', 'processing.html', 'surgery.html']) {
    const src = require('fs').readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    t.ok(/value="EOD"/.test(src), file + ': the frequency picker has EOD');
  }
  t.done();
})();
