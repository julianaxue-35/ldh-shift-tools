// "Send to nurse" on the tool pages: a tick per medication (some need no label made up), a Send to nurse button under
// "+ Register medication chart", and "Save chart & send to nurse". Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('nurse-send-panel');
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
    if (body.nurse_label) posts.push(body.nurse_label);
    route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, pending: [] }) });
  });
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  try {
    await page.goto('file://' + path.resolve(__dirname, '..', tool.file)); await page.waitForTimeout(500);
    await page.evaluate((field) => {
      const a = typeof makeAnimal === 'function' ? makeAnimal({ animalId: 'FICT-300', location: 'Cat Room 1', species: 'cat', weight: '4' }) : normalizeAnimal({ id: 'fict300', animalId: 'FICT-300', location: 'Cat Room 1', species: 'cat', weight: '4' });
      a[field] = 'meloxicam 1 tablet po once daily for 5 days\nlactulose 1ml po bid for 5 days';
      state.animals.push(a); saveShift(); renderShiftList(); window.__aid = a.id; openExam(a.id);
    }, tool.field);
    await page.waitForSelector('[data-nursepanel]');
    t.ok(/Register the medication chart first/.test(await page.textContent('[data-nursepanel]')), L + 'before a chart exists the panel says to register it first');
    dialogs.length = 0; await page.click('[data-nursepanel] [data-sendnurse]');
    t.ok(dialogs.length === 1 && /Register the medication chart first/.test(dialogs[0]) && posts.length === 0, L + 'Send to nurse with no chart explains and sends nothing: ' + dialogs[0]);
    await page.click('[data-regchart]');
    await page.waitForSelector('#saveSendChartBtn');
    const ticks = await page.$$eval('[data-mfield="nurseSend"]', els => els.map(e => e.checked));
    t.ok(ticks.length >= 2 && ticks.every(Boolean), L + 'every medication row has a "Send to nurse" tick, on by default: ' + ticks);
    await page.uncheck('[data-mfield="nurseSend"][data-mi="1"]');
    dialogs.length = 0;
    await page.click('#saveSendChartBtn');
    await page.waitForFunction(() => document.querySelector('[data-nursepanel] .np-line') && /sent to the Welfare nurse/i.test(document.querySelector('[data-nursepanel]').innerText), { timeout: 4000 });
    t.ok(posts.length === 1 && posts[0].animal_id === 'FICT-300' && posts[0].sent_by === 'ZZ', L + 'saved and sent: ' + JSON.stringify(posts[0] && { id: posts[0].animal_id, by: posts[0].sent_by }));
    t.ok(posts[0].labels.length === 1 && /^Meloxicam/.test(posts[0].labels[0].text), L + 'only the ticked medication goes (the un-ticked lactulose does not): ' + JSON.stringify(posts[0].labels.map(l => l.text)));
    const boxes = await page.$$eval('[data-nursepick]', els => els.map(e => e.checked));
    t.ok(boxes.length >= 2 && boxes[0] === true && boxes[1] === false, L + 'the panel keeps the same ticks: ' + boxes);
    // tick the second medication afterwards: the chart is now changed, and sending again carries both
    await page.check('[data-nursepick][data-mi="1"]');
    t.ok(/Send the changed labels to nurse/.test(await page.textContent('[data-nursepanel] [data-sendnurse]')), L + 'ticking another medication offers "Send the changed labels to nurse"');
    await page.click('[data-nursepanel] [data-sendnurse]');
    await page.waitForFunction(() => /Send to nurse again/.test(document.querySelector('[data-nursepanel] [data-sendnurse]').textContent), { timeout: 4000 });
    t.ok(posts.length === 2 && posts[1].labels.length === 2, L + 'the resend carries both labels: ' + posts[1].labels.length);
    // untick all: nothing to send
    await page.uncheck('[data-nursepick][data-mi="0"]'); await page.uncheck('[data-nursepick][data-mi="1"]');
    dialogs.length = 0; await page.click('[data-nursepanel] [data-sendnurse]');
    t.ok(/Tick at least one/.test(dialogs[0] || '') && posts.length === 2, L + 'with nothing ticked it asks for a tick and sends nothing');
    t.ok(errors.length === 0, L + 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}
(async () => { for (const tool of TOOLS) await run(tool); t.done(); })();
