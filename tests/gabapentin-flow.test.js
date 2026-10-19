// "start on gabapentin 0.25ml po bid for 4 days": the note, the chart, the label and the Excel sheet all agree.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const t = require('./check')('gabapentin-flow');

const plus = (days) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d.getDate() + '/' + (d.getMonth() + 1); };

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
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../processing.html'));
  await page.waitForTimeout(400);
  await page.evaluate(() => { state.animals = [makeAnimal({ animalId: 'GB-1', location: 'Pound 1', species: 'dog', weight: '10' })]; saveShift(); renderShiftList(); openExam(state.animals[0].id); });

  // 1. type the plan: the note carries the recheck date
  await page.fill('#fld_medplan', 'start on gabapentin 0.25ml po bid for 4 days');
  await page.dispatchEvent('#fld_medplan', 'change');
  await page.waitForTimeout(300);
  let note = await page.evaluate(() => assembleNote(state.animals[0]));
  t.ok(note.includes('start on gabapentin 0.25ml po bid for 4 days (recheck ' + plus(5) + ')'), 'the note shows the recheck date (tomorrow + 4 days): ' + (note.match(/Plan:.*/) || [''])[0]);

  // 2. the chart picks up 4 days, the label has the recheck, the sheet follows
  await page.click('[data-regchart]');
  await page.waitForSelector('[data-mfield="days"]');
  const draft = await page.evaluate(() => ({ days: document.querySelector('[data-mfield="days"]').value, label: document.querySelector('[data-mfield="labelText"]').value, recheck: document.querySelector('[data-recheck="0"]').textContent }));
  t.ok(draft.days === '4', 'the chart reads 4 days: ' + draft.days);
  t.ok(new RegExp('review due ' + plus(5).replace('/', '\\/') + '$').test(draft.label), 'the medication label carries the recheck date: ' + draft.label);
  t.ok(draft.recheck.includes(plus(5)), 'the editor shows the recheck: ' + draft.recheck);

  // 3. choose "today" for day 1: the chart moves a day earlier and the note moves with it
  await page.evaluate(() => { document.querySelectorAll('[data-setallstart="today"]').forEach(b => b.click()); });
  await page.waitForTimeout(200);
  await page.click('#saveChartBtn');
  await page.waitForTimeout(500);
  const out = await page.evaluate(async () => {
    const chart = MedChart.loadCharts()[0];
    const z = await JSZip.loadAsync(await MedChart.buildWorkbook([chart]));
    const xml = await z.file('xl/worksheets/sheet1.xml').async('string');
    return { days: chart.meds[0].days, start: chart.startOption, label: MedChart.labelFor(chart.meds[0], new Date(chart.createdAt), chart.startOption), sheet: (xml.match(/Review due [0-9]+\/[0-9]+/) || [''])[0], note: assembleNote(state.animals[0]).match(/Plan:.*/)[0] };
  });
  t.ok(out.days === 4 && out.start === 'today', 'saved chart: 4 days, starting today');
  t.ok(out.sheet === 'Review due ' + plus(4), 'the Excel sheet says Review due ' + plus(4) + ': ' + out.sheet);
  t.ok(/review due /.test(out.label) && out.label.endsWith(plus(4)), 'the label (dashboard / Admission AA) agrees: ' + out.label);
  t.ok(out.note === 'Plan: ' + out.label, 'the SAME label is now in the medical note, replacing the plan line: ' + out.note);
  t.ok(out.note === 'Plan: Gabapentin 0.25ml orally twice daily, review due ' + plus(4), 'and it reads as expected: ' + out.note);

  // 4. a label she edits in the chart editor carries into the note; a mg/kg figure is kept
  await page.evaluate(() => { const a = state.animals[0]; a.weight = '10'; a.medPlan = MedChart.annotateRecheck(MedChart.annotateMgPerKg('amoxyclav 250mg: give 1 tablet orally twice daily for 5 days', '10', 'dog')); saveShift(); openExam(a.id); });
  const before = await page.evaluate(() => state.animals[0].medPlan);
  await page.click('[data-regchart]');
  await page.waitForSelector('[data-mfield="labelText"]');
  await page.fill('[data-mfield="labelText"]', 'Amoxyclav 250mg 1 tablet BID, give with food, review due 25/10');
  await page.dispatchEvent('[data-mfield="labelText"]', 'input');
  await page.click('#saveChartBtn');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ plan: state.animals[0].medPlan, note: assembleNote(state.animals[0]).match(/Plan:.*/)[0] }));
  t.ok(/mg\/kg/.test(before), 'setup: the line had a mg/kg figure: ' + before);
  t.ok(/^Amoxyclav 250mg 1 tablet BID, give with food \([\d.]+mg\/kg\), review due 25\/10$/.test(after.plan), 'her edited label is in the note, with the mg/kg kept: ' + after.plan);
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
