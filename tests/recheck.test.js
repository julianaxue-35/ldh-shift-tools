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

  /* the NOTE carries the recheck date too: it is added to the plan line as she types it, and follows the days */
  const note = await page.evaluate(() => {
    const base = new Date('2026-10-19T09:00:00');
    const r = {};
    r.added = MedChart.annotateRecheck('start on doxybrom 0.2ml po bid for 7 days', base);
    r.moved = MedChart.annotateRecheck(r.added.replace('7 days', '10 days'), base);
    r.idempotent = MedChart.annotateRecheck(r.added, base);
    r.own = MedChart.annotateRecheck('amoxyclav 250mg po bid for 5 days, review 30/10', base);
    r.none = MedChart.annotateRecheck('continue gabapentin 100mg po bid', base);
    r.multi = MedChart.annotateRecheck('doxybrom 0.2ml po bid for 7 days\n\nmeloxicam 0.1ml po sid for 3 days', base);
    r.today = MedChart.annotateRecheck('amoxyclav po bid for 5 days', base, 'today');
    return r;
  });
  t.ok(note.added === 'start on doxybrom 0.2ml po bid for 7 days (recheck 27/10)', 'the plan line gets its recheck date: ' + note.added);
  t.ok(note.moved === 'start on doxybrom 0.2ml po bid for 10 days (recheck 30/10)', 'changing the days moves the date (no stale date left behind): ' + note.moved);
  t.ok(note.idempotent === note.added, 'running it again changes nothing');
  t.ok(note.own === 'amoxyclav 250mg po bid for 5 days, review 30/10', 'a date she wrote herself is left alone');
  t.ok(note.none === 'continue gabapentin 100mg po bid', 'a line with no duration is left alone (nothing is guessed)');
  t.ok(note.multi.split('\n').filter(l => /recheck/.test(l)).length === 2 && note.multi.split('\n')[1] === '', 'every medication line gets one; blank lines stay blank');
  t.ok(note.today === 'amoxyclav po bid for 5 days (recheck 24/10)', 'starting today puts it a day earlier: ' + note.today);

  /* typing it into the Plan box of a real exam puts it in the note */
  await page.evaluate(() => { state.animals = [makeAnimal({ animalId: 'RC-1', location: 'Pound 1', species: 'dog' })]; saveShift(); renderShiftList(); openExam(state.animals[0].id); });
  await page.fill('#fld_medplan', 'start on doxybrom 0.2ml po bid for 7 days');
  await page.dispatchEvent('#fld_medplan', 'change');
  await page.waitForTimeout(300);
  const planNote = await page.evaluate(() => assembleNote(state.animals[0]));
  t.ok(/Plan: start on doxybrom 0\.2ml po bid for 7 days \(recheck \d{1,2}\/\d{1,2}\)/.test(planNote), 'the note itself shows the recheck date: ' + (planNote.match(/Plan:.*/) || [''])[0]);

  /* where the chart has got to with the Admission AA */
  const lines = await page.evaluate(() => {
    const mk = (x) => Object.assign({ id: 'c', sourceTool: 'processing', animalId: 'RC-1', createdAt: new Date().toISOString(), startOption: 'tomorrow', meds: [{ days: 3, labelEdited: true, labelText: 'X' }] }, x);
    AAShare.setOn('processing', false);
    const off = MedChart.aaChartLine(mk({}));
    AAShare.setOn('processing', true);
    const c = mk({}); c.aaSig = null;
    const out = { off, none: MedChart.aaChartLine(null), notsent: MedChart.aaChartLine(Object.assign(mk({}), { aaErr: "Couldn't connect" })), noid: MedChart.aaChartLine(mk({ animalId: '' })) };
    const sent = mk({}); sent.aaSentAt = new Date().toISOString(); sent.aaSig = MedChart.aaChartSig(sent);
    out.sent = MedChart.aaChartLine(sent);
    out.done = MedChart.aaChartLine(Object.assign({}, sent, { aaEnteredAt: new Date().toISOString() }));
    out.stale = MedChart.aaChartLine(Object.assign({}, sent, { aaSig: 'old' }));
    out.surgery = MedChart.aaChartLine(mk({ sourceTool: 'surgery' }));
    AAShare.setOn('processing', false);
    return out;
  });
  t.ok(/NOT been sent.*switch is off/.test(lines.off), 'switch off: says it was not sent: ' + lines.off);
  t.ok(lines.none === '' && lines.surgery === '', 'no chart, or a Surgery chart: no line');
  t.ok(/NOT SENT/.test(lines.notsent) && /Couldn't connect/.test(lines.notsent) && /Resend/.test(lines.notsent), 'a failed send says NOT SENT and what to do: ' + lines.notsent);
  t.ok(/no animal ID/.test(lines.noid), 'no ID: explained');
  t.ok(/Sent to the Admission AA at \d.*Waiting for them to mark it done/.test(lines.sent), 'sent: shows the time and that it is waiting: ' + lines.sent);
  t.ok(/Done: the Admission AA has marked/.test(lines.done), 'done: says the AA has marked it done: ' + lines.done);
  t.ok(/Changed since it was sent/.test(lines.stale), 'changed after sending: says so');

  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
