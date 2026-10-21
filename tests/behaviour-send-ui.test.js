// "Send to Behaviour" button: Sick & Injured, Processing, Surgery. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('behaviour-send-ui');
const TOOLS = [
  { file: 'sick-injured.html', name: 'S&I', shiftKey: null },
  { file: 'processing.html', name: 'Processing', shiftKey: 'ldh_processing_shift_v1' },
  { file: 'surgery.html', name: 'Surgery', shiftKey: 'ldh_surgery_shift_v1' }
];

async function start(tool, animals) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const sent = []; let mode = 'ok';
  await ctx.route('**/*', async (route) => {
    const url = route.request().url(); if (process.env.DBG) console.log('REQ', route.request().method(), url.slice(0, 120), (route.request().postData() || '').slice(0, 80));
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.behaviour) {
      sent.push(body.behaviour);
      if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', headers: hdr, body: JSON.stringify({ error: 'Could not save.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, updated: sent.length > 1 }) });
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: '{}' });
  });
  await ctx.addInitScript((o) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    if (o.shiftKey) { localStorage.setItem(o.shiftKey, JSON.stringify(o.animals)); localStorage.setItem(o.shiftKey + '_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })); }
  }, { shiftKey: tool.shiftKey, animals });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '..', tool.file));
  await page.waitForTimeout(500);
  if (!tool.shiftKey) await page.evaluate((as) => { state.animals.length = 0; as.forEach(a => state.animals.push(a)); saveShift(); renderShiftList(); }, animals);
  return { browser, page, errors, sent, setMode: m => { mode = m; } };
}

(async () => {
  for (const tool of TOOLS) {
    const L = tool.name + ': ';
    const base = (id, extra) => Object.assign({ id, animalId: id, location: 'Cat Room 1 / 3', species: 'cat', registered: false, noteEdited: 'Whole note for ' + id + '\n"quoted" \u{1F600}', weight: '4' }, extra || {});
    const s = await start(tool, [base('BEH-1'), base('BEH-2', { animalId: '' })]);
    try {
      const btn = (id) => s.page.locator('.bh-send[data-bh="' + id + '"]:visible').first();
      t.ok(await btn('BEH-1').count() === 1, L + 'an animal card has a Send to Behaviour button');
      t.ok(await btn('BEH-2').isDisabled(), L + 'disabled when the animal has no ID');
      await btn('BEH-1').click();
      await s.page.waitForSelector('.bh-modal');
      await s.page.click('.bh-go');
      t.ok(/why/i.test(await s.page.textContent('.bh-msg')) && s.sent.length === 0, L + 'a reason is required');
      await s.page.fill('.bh-reason', 'Hissing and swiping at handling');
      await s.page.fill('.bh-init', '');
      await s.page.click('.bh-go');
      t.ok(/initials/i.test(await s.page.textContent('.bh-msg')) && s.sent.length === 0, L + 'initials are required');
      s.setMode('fail');
      await s.page.fill('.bh-init', 'ab'); await s.page.selectOption('.bh-window', '48h');
      await s.page.click('.bh-go');
      await s.page.waitForFunction(() => /NOT SENT/.test(document.querySelector('.bh-msg').textContent));
      t.ok(s.sent.length === 1, L + 'a failed send is shown as NOT SENT');
      s.setMode('ok');
      await s.page.click('.bh-go');
      await s.page.waitForSelector('.bh-modal', { state: 'detached' });
      const b = s.sent[1];
      t.ok(b && b.animal_id === 'BEH-1' && b.window === '48h' && b.sent_by.toUpperCase() === 'AB' && /Hissing/.test(b.reason), L + 'the request carries ID, reason, time frame and initials: ' + JSON.stringify(b && { ...b, note: '…' }));
      t.ok(b && b.note.includes('Whole note for BEH-1') && b.note.includes('\u{1F600}'), L + 'the whole note is attached');
      t.ok(/Sent to Behaviour/.test(await btn('BEH-1').textContent()), L + 'the button shows Sent ✓ after a confirmed send');
      await s.page.evaluate(() => { const a = state.animals.find(x => x.animalId === 'BEH-1'); a.noteEdited = 'Edited note'; });
      await s.page.evaluate(() => renderShiftList());
      t.ok(/Edited/.test(await btn('BEH-1').textContent()), L + 'editing the note afterwards offers a resend');
      const kept = await s.page.evaluate(() => JSON.stringify(state.animals.find(x => x.animalId === 'BEH-1')));
      t.ok(/bhSentAt/.test(kept), L + 'the sent state is saved with the animal');
      t.ok(s.errors.length === 0, L + 'no page errors: ' + s.errors.join('|'));
    } finally { await s.browser.close(); }
  }
  t.done();
})();
