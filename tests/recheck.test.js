// Medication chart: the recheck date follows the number of days; every medication carries one.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const t = require('./check')('recheck');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const tpl = fs.readFileSync(path.resolve(__dirname, '../template/medication-chart-template.xlsx')).toString('base64');
  await ctx.addInitScript((tpl) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    const real = window.fetch.bind(window);
    window.fetch = (u, ...r) => { if (String(u).includes('medication-chart-template.xlsx')) { const b = atob(tpl); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return Promise.resolve(new Response(a, { status: 200 })); } return real(u, ...r); };
  }, tpl);
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../processing.html'));
  await page.waitForTimeout(400);
  const out = await page.evaluate(async () => {
    const base = new Date('2026-10-19T09:00:00');        // a Monday
    const parsed = MedChart.parseMedPlan('start on doxybrom 0.2ml po bid for 7 days')[0];
    const res = {};
    res.fresh = MedChart.reviewDateText(parsed, base);                                   // tomorrow + 7 days
    res.freshDisplay = MedChart.recheckDisplay(parsed, base);
    parsed.days = 10; res.after10 = MedChart.reviewDateText(parsed, base);               // follows the Days box
    parsed.days = 7; parsed.startOption = 'today'; res.today7 = MedChart.reviewDateText(parsed, base);
    const typed = MedChart.parseMedPlan('amoxyclav 250mg po bid for 5 days, review 30/10')[0];
    res.typedKept = MedChart.reviewDateText(typed, base);                                // her date, Days unchanged
    typed.days = 3; res.typedDaysChanged = MedChart.reviewDateText(typed, base);         // Days changed: recompute
    res.chartStart = MedChart.reviewDateText({ days: 5, rawText: '' }, base, 'today');   // chart-level "today"
    // a medication whose label she wrote herself, with no recheck in it, gets one
    res.editedAdded = MedChart.labelFor({ days: 7, labelEdited: true, labelText: 'Doxybrom 0.2ml PO BID' }, base);
    res.editedKept = MedChart.labelFor({ days: 7, labelEdited: true, labelText: 'Doxybrom 0.2ml PO BID, recheck Fri' }, base);
    // the Excel sheet's warning cell follows Days too
    const med = Object.assign({}, MedChart.parseMedPlan('start on doxybrom 0.2ml po bid for 7 days')[0], { startOption: 'tomorrow', days: 4 });
    const chart = { id: 'x', animalId: 'R-1', createdAt: base.toISOString(), startOption: 'tomorrow', meds: [med], sourceTool: 'manual' };
    const z = await JSZip.loadAsync(await MedChart.buildWorkbook([chart]));
    const xml = await z.file('xl/worksheets/sheet1.xml').async('string');
    res.sheet = (xml.match(/Review due [0-9]+\/[0-9]+/) || [''])[0];
    return res;
  });
  t.ok(out.fresh === '27/10' && out.freshDisplay === 'Tue 27/10', 'recheck = the day after the last dose, with the weekday: ' + out.fresh + ' / ' + out.freshDisplay);
  t.ok(out.after10 === '30/10', 'changing Days to 10 moves the recheck to 30/10: ' + out.after10);
  t.ok(out.today7 === '26/10', 'starting today puts it a day earlier: ' + out.today7);
  t.ok(out.typedKept === '30/10', 'a date the vet typed is kept while Days is unchanged: ' + out.typedKept);
  t.ok(out.typedDaysChanged === '23/10', 'but follows Days once Days is changed (3 days from tomorrow = 23/10): ' + out.typedDaysChanged);
  t.ok(out.chartStart === '24/10', 'the chart-level "start today" is honoured: ' + out.chartStart);
  t.ok(/review due 26\/10$/.test(out.editedAdded.replace(/\s+$/, '')) || /review due 27\/10$/.test(out.editedAdded), 'her own wording gets a recheck added when it has none: ' + out.editedAdded);
  t.ok(out.editedKept === 'Doxybrom 0.2ml PO BID, recheck Fri', 'her own recheck wording is left alone: ' + out.editedKept);
  t.ok(out.sheet === 'Review due 24/10', 'the Excel chart shows the recheck for the chosen days (4 days from tomorrow): ' + out.sheet);
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
