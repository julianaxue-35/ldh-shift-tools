// "Send to nurse" on the tool pages: a tick per medication (some need no label made up), a Send to nurse button under
// "+ Register medication chart", and "Save chart & send to nurse". Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const t = require('./check')('nurse-chart-send');
const TOOLS = [
  { file: 'processing.html', name: 'Processing', field: 'medPlan' },
  { file: 'sick-injured.html', name: 'S&I', field: 'treatment' },
  { file: 'surgery.html', name: 'Surgery', field: 'newMedChartText' }
];
async function run(tool) {
  const L = tool.name + ': ';
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.nurse_chart) posts.push(body.nurse_chart);
    route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, pending: [] }) });
  });
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
  // Chromium cannot fetch() file:// URLs, so serve the Excel template to the page's fetch directly.
  const tpl = fs.readFileSync(path.resolve(__dirname, '../template/medication-chart-template.xlsx')).toString('base64');
  await ctx.addInitScript((b64) => {
    const real = window.fetch.bind(window);
    window.fetch = (u, ...rest) => {
      if (String(u).includes('medication-chart-template.xlsx')) { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return Promise.resolve(new Response(arr, { status: 200 })); }
      return real(u, ...rest);
    };
  }, tpl);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  try {
    await page.goto('file://' + path.resolve(__dirname, '..', tool.file)); await page.waitForTimeout(500);
    await page.evaluate((field) => {
      const a = typeof makeAnimal === 'function' ? makeAnimal({ animalId: 'FICT-300', location: 'Cat Room 1', species: 'cat', weight: '4' }) : normalizeAnimal({ id: 'fict300', animalId: 'FICT-300', location: 'Cat Room 1', species: 'cat', weight: '4' });
      a[field] = 'meloxicam 1 tablet po once daily for 5 days\nlactulose 1ml po bid for 5 days';
      state.animals.push(a); saveShift(); renderShiftList(); window.__aid = a.id; openExam(a.id);
    }, tool.field);
    await page.waitForSelector('[data-regchart]');
    t.ok(!(await page.locator('[data-nursepanel] [data-sendnurse]').count()), L + 'before a chart is registered there is no separate Send to nurse button (it is in the chart preview)');
    t.ok(!(await page.locator('#addMedRowBtn, #addBlankMedBtn').count()), L + 'there is no "add a line" button');
    await page.click('[data-regchart]');
    await page.waitForSelector('#saveChartBtn', { state: 'attached' });
    await page.click('#saveChartBtn');   // nothing ticked for the nurse: the chart alone is saved
    await page.waitForSelector('[data-nursepanel] [data-sendchart]', { timeout: 4000 });
    t.ok(/Send chart to nurses to print/.test(await page.textContent('[data-nursepanel] [data-sendchart]')), L + 'a Send chart to nurses to print button, with no medication ticked');
    t.ok(posts.length === 0, L + 'saving alone sends nothing');
    dialogs.length = 0;
    await page.click('[data-nursepanel] [data-sendchart]');
    await page.waitForFunction(() => /Chart sent to the nurses to print/.test(document.querySelector('[data-nursepanel]').innerText), { timeout: 8000 });
    t.ok(posts.length === 1 && posts[0].animal_id === 'FICT-300' && posts[0].sent_by === 'ZZ' && posts[0].location === 'Cat Room 1', L + 'the chart is sent for FICT-300 by the vet: ' + JSON.stringify(posts[0] && { id: posts[0].animal_id, by: posts[0].sent_by }));
    t.ok(posts[0].lines.length === 2 && /^meloxicam/i.test(posts[0].lines[0]) && /^UEsDB/.test(posts[0].xlsx_b64) && posts[0].key, L + 'it carries the medication lines and the Excel file (a zip)');
    t.ok(/Send chart to nurses again/.test(await page.textContent('[data-nursepanel] [data-sendchart]')), L + 'afterwards it offers send again');
    await page.evaluate(() => { const c = MedChart.loadCharts()[0]; c.meds[0].days = 9; localStorage.setItem(MedChart.STORAGE_KEY, JSON.stringify([c])); MedChart.refreshNursePanels(); });
    t.ok(/Send the changed chart to nurses/.test(await page.textContent('[data-nursepanel] [data-sendchart]')), L + 'editing the chart afterwards offers "Send the changed chart to nurses"');
    t.ok(errors.length === 0, L + 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}
(async () => { for (const tool of TOOLS) await run(tool); t.done(); })();
