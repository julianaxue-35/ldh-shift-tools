// A medication chart that was edited after it went to the Admission AA is sent again automatically, whatever the share switch says.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const t = require('./check')('chart-edit-aa');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const aaPosts = []; let up = true;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.aa && !up) return route.abort();
    if (body.aa) aaPosts.push(body.aa);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[],"present":[]}' });
  });
  const mk = (id, animalId, extra) => Object.assign({ id, sourceAnimalId: id, sourceTool: 'processing', createdAt: new Date().toISOString(), animalId, species: 'dog', weight: '10', location: 'Pound 1', vetInCharge: 'JX', problemList: '', startOption: 'tomorrow',
    meds: [{ drugKey: 'x', drugLabel: 'Drug X', doseText: '1 tab', freq: 'SID', route: 'PO', days: 3, startSlot: 'AM', startOption: 'tomorrow', labelEdited: true, labelText: 'Drug X 1 tab once daily' }] }, extra || {});
  // Chromium cannot fetch() file:// URLs, so serve the Excel template to the page's fetch directly.
  const tpl = fs.readFileSync(path.resolve(__dirname, '../template/medication-chart-template.xlsx')).toString('base64');
  await ctx.addInitScript((b64) => {
    const real = window.fetch.bind(window);
    window.fetch = (u, ...rest) => {
      if (String(u).includes('medication-chart-template.xlsx')) { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return Promise.resolve(new Response(arr, { status: 200 })); }
      return real(u, ...rest);
    };
  }, tpl);
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../medication-charts.html')); await page.waitForTimeout(400);
  // seed: A was sent and is up to date; B was sent then edited (stale); C was never sent (share switch is off)
  await page.evaluate((cs) => {
    const sentAt = new Date().toISOString();
    const list = cs.map(c => c);
    list[0].aaSentAt = sentAt; list[0].aaSig = MedChart.aaChartSig(list[0]);
    list[1].aaSentAt = sentAt; list[1].aaSig = 'an older version';
    MedChart.saveCharts(list);
  }, [mk('a', 'SENT-OK'), mk('b', 'EDITED-1'), mk('c', 'NEVER-1')]);
  aaPosts.length = 0;
  await page.evaluate(() => MedChart.aaCatchUp(true));
  await page.waitForFunction(() => true); await page.waitForTimeout(1500);
  t.ok(aaPosts.length === 1 && aaPosts[0].animal_id === 'EDITED-1' && aaPosts[0].kind === 'med_chart', 'the catch-up sends only the edited chart, not the up-to-date one or the never-sent one: ' + aaPosts.map(a => a.animal_id).join());
  t.ok(/Drug X 1 tab once daily/.test(JSON.stringify(aaPosts[0].payload.lines)) && aaPosts[0].payload.xlsx_b64.length > 1000, 'with its drug lines and the Excel chart');
  t.ok(await page.evaluate(() => MedChart.aaChartStatus(MedChart.loadCharts()[1])) === 'sent', 'and it then counts as sent');
  // editing a sent chart sends the new version straight away, with the share switch off
  aaPosts.length = 0;
  await page.evaluate(() => { const c = MedChart.loadCharts()[0]; const meds = JSON.parse(JSON.stringify(c.meds)); meds[0].labelText = 'Drug X 2 tabs once daily'; MedChart.updateChart(c.id, { meds }); });
  await page.waitForTimeout(1500);
  t.ok(aaPosts.length === 1 && aaPosts[0].animal_id === 'SENT-OK' && /2 tabs/.test(JSON.stringify(aaPosts[0].payload.lines)), 'an edit made on the charts page goes to the AA straight away: ' + aaPosts.map(a => a.animal_id).join());
  // editing a chart that was never sent does not send it (the share switch is off)
  aaPosts.length = 0;
  await page.evaluate(() => { const c = MedChart.loadCharts()[2]; MedChart.updateChart(c.id, { weight: '11' }); });
  await page.waitForTimeout(800);
  t.ok(aaPosts.length === 0, 'a chart that was never shared is not sent just because it was edited');
  // offline: the edit is not lost, it goes when the connection is back
  up = false; aaPosts.length = 0;
  await page.evaluate(() => { const c = MedChart.loadCharts()[0]; const meds = JSON.parse(JSON.stringify(c.meds)); meds[0].labelText = 'Drug X 3 tabs once daily'; MedChart.updateChart(c.id, { meds }); });
  await page.waitForTimeout(1200);
  t.ok(await page.evaluate(() => MedChart.aaChartStatus(MedChart.loadCharts()[0])) === 'stale', 'offline: the chart stays marked as changed since sent');
  up = true;
  await page.evaluate(() => MedChart.aaCatchUp(true)); await page.waitForTimeout(1500);
  t.ok(aaPosts.length === 1 && /3 tabs/.test(JSON.stringify(aaPosts[0].payload.lines)) && await page.evaluate(() => MedChart.aaChartStatus(MedChart.loadCharts()[0])) === 'sent', 'back online: the latest version is sent by itself');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
