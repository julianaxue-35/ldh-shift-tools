// Medication charts auto-send to the Admission AA when the share switch is on (Processing + Sick & Injured).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('chart-aa');

const TOOLS = [
  { file: 'processing.html', key: 'processing', shiftKey: 'ldh_processing_shift_v1', sourceTool: 'processing' },
  { file: 'sick-injured.html', key: 'sick_injured', shiftKey: null, sourceTool: 'sick-injured' }
];

const chart = (over) => Object.assign({
  id: 'mc_' + Math.random().toString(36).slice(2), sourceAnimalId: 'a1', sourceTool: 'processing', createdAt: new Date().toISOString(),
  animalId: 'T-200', species: 'dog', weight: '10', location: 'Pound 1', vetInCharge: 'jx', startOption: 'tomorrow',
  meds: [{ drugKey: 'doxybrome', drugName: 'Doxybrom', route: 'PO', frequency: 'BID', days: 7, startOption: 'tomorrow', labelEdited: true, labelText: 'Doxybrom 0.2ml PO BID for 7 days' }]
}, over || {});

async function start(tool, { online = true, shared = true } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const sent = [];
  let up = online;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (!up) return route.abort();
    if (body.aa) sent.push(body.aa);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body.aa ? { ok: true } : {}) });
  });
  await ctx.addInitScript((seed) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    if (seed.shared) localStorage.setItem('ldh_aa_share_' + seed.key, '1');
  }, { shared, key: tool.key });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto('file://' + path.resolve(__dirname, '..', tool.file));
  await page.waitForTimeout(400);
  // the switch only stays on while the shift list has an animal
  await page.evaluate((o) => { if (!state.animals.length) { state.animals.push({ id: 'a1', animalId: 'T-200', location: 'Pound 1', species: 'dog', registered: true, noteEdited: 'n' }); } AAShare.setOn(o.key, o.shared); }, { key: tool.key, shared });
  return { browser, page, sent, errors, dialogs, setOnline: (v) => { up = v; } };
}

(async () => {
  for (const tool of TOOLS) {
    const L = tool.key + ': ';
    let s = await start(tool);
    try {
      await s.page.evaluate(() => { state.animals.forEach(a => { a.aaSentAt = new Date().toISOString(); }); });
      /* 1. saving a chart sends it */
      await s.page.evaluate((c) => { MedChart.addChart(c); }, chart({ sourceTool: tool.sourceTool }));
      await s.page.waitForFunction(() => MedChart.loadCharts().some(c => c.aaSentAt));
      const m = s.sent.filter(x => x.kind === 'med_chart');
      t.ok(m.length === 1, L + 'one chart card sent: ' + JSON.stringify(s.sent.map(x => x.kind)));
      t.ok(m[0] && m[0].animal_id === 'T-200' && m[0].location === 'Pound 1' && m[0].sent_by === 'jx', L + 'card carries ID, location, vet');
      t.ok(m[0] && m[0].payload.lines.length === 1 && m[0].payload.lines[0].includes('Doxybrom 0.2ml'), L + 'drug line sent: ' + JSON.stringify(m[0] && m[0].payload));

      /* 2. editing the saved chart sends the update */
      await s.page.evaluate(() => { const c = MedChart.loadCharts()[0]; MedChart.updateChart(c.id, { meds: [Object.assign({}, c.meds[0], { labelText: 'Doxybrom 0.3ml PO BID for 7 days' })] }); });
      await s.page.waitForFunction(() => MedChart.loadCharts()[0].aaSig !== undefined && MedChart.aaChartStatus(MedChart.loadCharts()[0]) === 'sent');
      t.ok(s.sent.filter(x => x.kind === 'med_chart').length === 2 && s.sent[s.sent.length - 1].payload.lines[0].includes('0.3ml'), L + 'edited chart re-sent');

      /* 3. charts from other tools are never sent */
      const before = s.sent.length;
      await s.page.evaluate((c) => { MedChart.addChart(c); }, chart({ sourceTool: 'surgery', animalId: 'S-1' }));
      await s.page.evaluate((c) => { MedChart.addChart(c); }, chart({ sourceTool: 'manual', animalId: 'M-1' }));
      await s.page.waitForTimeout(400);
      t.ok(s.sent.length === before, L + 'surgery/manual charts are not sent');
      t.ok(s.errors.length === 0, L + 'no page errors: ' + s.errors.join('|'));
    } finally { await s.browser.close(); }

    /* 4. switch off: nothing sent */
    s = await start(tool, { shared: false });
    try {
      await s.page.evaluate((c) => { MedChart.addChart(c); }, chart({ sourceTool: tool.sourceTool }));
      await s.page.waitForTimeout(400);
      t.ok(s.sent.length === 0, L + 'nothing sent with the switch off');
      /* ...but switching on catches up the chart saved earlier today */
      await s.page.evaluate(() => { state.animals.forEach(a => { a.registered = true; a.aaSentAt = new Date().toISOString(); a.aaSig = AAShare.sig(aaSigText(a)); }); });
      await s.page.check('#aaShareToggle');
      await s.page.waitForFunction(() => MedChart.loadCharts().some(c => c.aaSentAt));
      t.ok(s.sent.filter(x => x.kind === 'med_chart').length === 1, L + 'switching on sends charts saved earlier today');
    } finally { await s.browser.close(); }

    /* 5. offline: NOT SENT, red bar, guard, Resend */
    s = await start(tool, { online: false });
    try {
      await s.page.evaluate(() => { state.animals.forEach(a => { a.registered = true; a.aaSentAt = new Date().toISOString(); a.aaSig = AAShare.sig(aaSigText(a)); }); });
      await s.page.evaluate((c) => { MedChart.addChart(c); }, chart({ sourceTool: tool.sourceTool }));
      await s.page.waitForFunction(() => MedChart.loadCharts()[0].aaErr);
      await s.page.evaluate(() => renderAaShare());
      t.ok(!(await s.page.isHidden('#aaRedBar')), L + 'red bar shows for an unsent chart');
      const listText = await s.page.textContent('#aaShareList');
      t.ok(/T-200/.test(listText) && /NOT SENT/.test(listText) && /chart/i.test(listText), L + 'list names the unsent chart: ' + listText.trim().slice(0, 120));
      s.dialogs.length = 0;
      await s.page.evaluate(() => aaGuard('Export'));
      t.ok(s.dialogs.some(d => /NOT been sent/.test(d)), L + 'export guard warns about the unsent chart');
      s.setOnline(true);
      await s.page.click('#aaShareList .aa-resend-chart');
      await s.page.waitForFunction(() => MedChart.loadCharts()[0].aaSentAt);
      t.ok(s.sent.filter(x => x.kind === 'med_chart').length === 1, L + 'Resend delivers the chart');
      t.ok(await s.page.isHidden('#aaRedBar'), L + 'red bar clears after resend');
    } finally { await s.browser.close(); }
  }
  t.done();
})();
