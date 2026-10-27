// Medication Charts page: a button on each chart sends the long label to the Welfare nurse (animal ID, space, vet initials).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('nurse-label-button');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = []; let mode = 'ok';
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.nurse_label) { if (mode === 'down') return route.abort(); if (mode === 'bad') return route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, body: '{"error":"x"}' }); posts.push(body.nurse_label); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"pending":[]}' });
  });
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  await page.goto('file://' + path.resolve(__dirname, '../medication-charts.html')); await page.waitForTimeout(400);
  await page.evaluate(() => {
    const tick = ms => ms.map(m => Object.assign(m, { nurseSend: true }));   // ticks are off by default: these are the medications the vet ticked to send
    const meds = tick(MedChart.parseMedPlan('meloxicam 1 tablet po once daily for 5 days review 26/10\ngabapentin 0.25ml po bid for 4 days'));
    MedChart.saveCharts([{ id: 'c1', sourceAnimalId: 'x', sourceTool: 'surgery', createdAt: new Date().toISOString(), animalId: 'LBL-1', species: 'dog', weight: '10', location: 'Pound 1 / 4', vetInCharge: 'JX', problemList: '', startOption: 'tomorrow', meds },
      { id: 'c2', sourceAnimalId: 'y', sourceTool: 'surgery', createdAt: new Date().toISOString(), animalId: '', species: 'dog', weight: '10', location: 'Pound 2', vetInCharge: 'JX', problemList: '', startOption: 'tomorrow', meds: tick(MedChart.parseMedPlan('gabapentin 0.25ml po bid for 4 days')) }]);
  });
  await page.reload(); await page.waitForSelector('[data-chartid="c1"]');
  t.ok(await page.locator('[data-chartid="c1"] .nl-send').count() === 1 && /Send label to the Welfare nurse/.test(await page.textContent('[data-chartid="c1"] .nl-send')), 'each chart has a "Send label to the Welfare nurse" button');
  await page.click('[data-chartid="c1"] .nl-send');
  await page.waitForFunction(() => /Label sent to the Welfare nurse/.test(document.querySelector('[data-chartid="c1"]').innerText));
  const p = posts[0];
  t.ok(p.animal_id === 'LBL-1' && p.location === 'Pound 1 / 4' && p.sent_by === 'JX' && p.labels.length === 2, 'sends the animal ID, space and vet initials, one label per medication: ' + JSON.stringify({ id: p.animal_id, loc: p.location, by: p.sent_by, n: p.labels.length }));
  t.ok(p.labels[0].text === 'Meloxicam, give 1 tablet orally once daily with food for 5 days, stop if vomiting, diarrhoea, or not eating, review on 26/10', 'the long label: ' + p.labels[0].text);
  t.ok(p.labels[0].key === 'c1|0' && p.labels[1].key === 'c1|1', 'each label has its own key (so a resend updates, not duplicates)');
  t.ok(/Label sent to the Welfare nurse \(send again\)/.test(await page.textContent('[data-chartid="c1"] .nl-send')), 'the button then offers to send again');
  // edit the chart: it is flagged as changed, and sending again carries the new text
  await page.evaluate(() => { const c = MedChart.loadCharts()[0]; const meds = JSON.parse(JSON.stringify(c.meds)); meds[1].days = 7; MedChart.updateChart(c.id, { meds }); });
  await page.reload(); await page.waitForSelector('[data-chartid="c1"]');
  t.ok(/Changed since the label was sent/.test(await page.textContent('[data-chartid="c1"] .nl-status')) && /Send the changed label/.test(await page.textContent('[data-chartid="c1"] .nl-send')), 'an edited chart says its label has changed');
  posts.length = 0; await page.click('[data-chartid="c1"] .nl-send');
  await page.waitForFunction(() => /Label sent to the Welfare nurse at/.test(document.querySelector('[data-chartid="c1"]').innerText));
  t.ok(/for 7 days/.test(posts[0].labels[1].text), 'the new version is what goes: ' + posts[0].labels[1].text);
  // failures are shown, not hidden
  mode = 'down';
  await page.click('[data-chartid="c1"] .nl-send');
  await page.waitForFunction(() => /NOT SENT to the Welfare nurse/.test(document.querySelector('[data-chartid="c1"]').innerText));
  t.ok(true, 'if the dashboard cannot be reached it says NOT SENT');
  // no animal ID: asked to add it
  await page.click('[data-chartid="c2"] .nl-send');
  t.ok(alerts.some(a => /Animal ID/.test(a)) && posts.length === 1, 'a chart with no animal ID is not sent');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
