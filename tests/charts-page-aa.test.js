// Medication Charts page: charts the Admission AA has ticked off are marked Done.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('charts-page-aa');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  let pending = ['med_chart|WAIT-1'], up = true;
  const asked = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (!up) return route.abort();
    if (body.aa_check) { asked.push(body.aa_check.items); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, pending }) }); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
  const mk = (id, animalId, extra) => Object.assign({ id, sourceAnimalId: id, sourceTool: 'processing', createdAt: new Date().toISOString(), animalId, species: 'dog', weight: '10', location: 'Pound 1', vetInCharge: 'jx', startOption: 'tomorrow',
    meds: [{ drugKey: 'x', drugLabel: 'Drug X', doseText: '1 tab', freq: 'SID', route: 'PO', days: 3, startSlot: 'AM', startOption: 'tomorrow', labelEdited: true, labelText: 'Drug X' }] }, extra || {});
  const charts = [mk('c1', 'DONE-1', { aaSentAt: new Date().toISOString() }), mk('c2', 'WAIT-1', { aaSentAt: new Date().toISOString() }), mk('c3', 'NEVER-1'), mk('c4', 'S-1', { sourceTool: 'surgery', aaSentAt: new Date().toISOString() })];
  charts.forEach(c => { if (c.aaSentAt) { c.aaSig = null; } });
  await ctx.addInitScript((cs) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    if (!localStorage.getItem('ldh_medcharts_v1')) localStorage.setItem('ldh_medcharts_v1', JSON.stringify(cs));   // seed once: a reload keeps what the page saved
  }, charts);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // give the sent charts a matching signature so they are "sent", not "changed since sent"
  await page.addInitScript(() => {});
  await page.goto('file://' + path.resolve(__dirname, '../medication-charts.html'));
  await page.evaluate(() => {
    const list = MedChart.loadCharts();
    list.forEach(c => { if (c.aaSentAt) c.aaSig = MedChart.aaChartSig(c); });
    MedChart.saveCharts(list);
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.aa-status').length >= 2, null, { timeout: 8000 });
  await page.waitForTimeout(2500);
  const card = id => page.innerText('[data-chartid="' + id + '"]').then(x => x.replace(/\s+/g, ' '));
  t.ok(/Done: the Admission AA has marked this chart as done/.test(await card('c1')), 'a chart whose AA card is gone is marked Done: ' + (await card('c1')).slice(0, 160));
  t.ok(/Waiting for them to mark it done/.test(await card('c2')) && !/Done: the Admission AA/.test(await card('c2')), 'a chart still waiting says so');
  t.ok(!/Admission AA/.test(await card('c3')), 'a chart that was never sent shows no AA line');
  t.ok(!/Admission AA/.test(await card('c4')), 'a Surgery chart shows no AA line');
  t.ok(asked[0].map(i => i.animal_id).sort().join() === 'DONE-1,WAIT-1' && asked[0].every(i => i.kind === 'med_chart'), 'only the sent Processing / Sick & Injured charts are asked about: ' + JSON.stringify(asked[0]));

  // it comes back if the AA card reappears; an unreachable dashboard changes nothing
  up = false;
  await page.evaluate(() => checkAaDone());
  await page.waitForTimeout(400);
  t.ok(/Done: the Admission AA/.test(await card('c1')), 'offline: nothing changes');
  up = true; pending = ['med_chart|WAIT-1', 'med_chart|DONE-1'];
  await page.evaluate(() => checkAaDone());
  await page.waitForFunction(() => /Waiting for them/.test(document.querySelector('[data-chartid="c1"]').innerText), null, { timeout: 5000 });
  t.ok(true, 'a card that comes back goes back to waiting');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
