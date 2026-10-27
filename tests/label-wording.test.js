// The label wording (what goes to the nurses and into the note) is the vet's own words; the Drug field stays short for the spreadsheet.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('label-wording');
const L = 'meloxicam, give 1 tablet orally with food for 5 days, stop if see vomiting, diarrhoea and or not eating, review on 26/10';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = [];
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.nurse_label) posts.push(body.nurse_label);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[],"pending":[]}' });
  });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../sick-injured.html')); await page.waitForTimeout(500);
  // 1. the parser keeps her wording and a short drug
  const r = await page.evaluate((l) => { const m = MedChart.parseMedPlan(l)[0]; return { drug: m.drugLabel, label: m.labelText, edited: m.labelEdited, days: m.days, review: MedChart.reviewDateText(m, new Date('2026-10-21T10:00:00'), 'tomorrow') }; }, L);
  t.ok(r.drug === 'Meloxicam' && r.label === L && r.edited === true && r.days === 5 && r.review === '26/10', 'a typed label becomes the label wording as written; the drug stays "Meloxicam": ' + JSON.stringify({ drug: r.drug, review: r.review }));
  const r2 = await page.evaluate(() => { const m = MedChart.parseMedPlan('famotidine, give 1 tablet orally for 5 days, review on 26/10')[0]; return m.drugLabel; });
  t.ok(r2 === 'famotidine', 'an unrecognised drug is cut at the comma, not "famotidine,": ' + r2);
  t.ok(await page.evaluate(() => { const m = MedChart.parseMedPlan('gabapentin 0.25ml po bid for 4 days')[0]; return m.labelEdited === false && /twice daily/.test(m.labelText); }), 'shorthand ("gabapentin 0.25ml po bid for 4 days") is still spelled out automatically');
  // 2. in the chart draft: editing the drug does not touch her wording
  await page.evaluate((l) => { const a = makeAnimal({ animalId: 'LW-1', location: 'Pound 1', species: 'dog', weight: '10', noteText: '', otherReminders: [] }); a.treatment = l; state.animals = [a]; saveShift(); renderShiftList(); openExam(a.id); }, L);
  await page.click('[data-regchart]');
  t.ok((await page.inputValue('[data-mfield="drugLabel"]')) === 'Meloxicam' && (await page.inputValue('[data-mfield="labelText"]')) === L, 'the draft shows the short drug and her label wording');
  await page.fill('[data-mfield="drugLabel"]', 'Meloxicam 1.5mg/ml');
  t.ok((await page.inputValue('[data-mfield="labelText"]')) === L, 'changing the drug does not rewrite the label wording');
  await page.fill('[data-mfield="labelText"]', L + ' (with a meal)');
  t.ok((await page.inputValue('[data-mfield="drugLabel"]')) === 'Meloxicam 1.5mg/ml', 'changing the label wording does not change the drug');
  // 3. the nurses get her wording
  const sent = await page.evaluate(() => { const c = { id: 'lw', animalId: 'LW-1', location: 'Pound 1', vetInCharge: 'JX', createdAt: new Date().toISOString(), startOption: 'tomorrow', meds: [Object.assign(MedChart.parseMedPlan('meloxicam 0.1ml PO once daily for 3 days')[0], { nurseSend: true, labelEdited: true, labelText: 'Meloxicam, give 0.1 mL by mouth with food for 3 days, review on 25/10' })] }; return MedChart.nurseLabels(c).map(x => x.text); });
  t.ok(sent[0] === 'Meloxicam, give 0.1 mL by mouth with food for 3 days, review on 25/10', 'the label sent to the nurses is the label wording as she wrote it: ' + sent[0]);
  // 4. the note keeps her line
  const note = await page.evaluate((l) => { const chart = { id: 'n', createdAt: new Date().toISOString(), startOption: 'tomorrow', meds: MedChart.parseMedPlan(l) }; return MedChart.putLabelsInNote(l, chart); }, L);
  t.ok(note === L, 'her wording stays in the medical note');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
