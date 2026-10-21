// A different vet opens the tool the next day and sends last night's unsent notes: the notes must keep the FIRST vet's
// initials, not the new vet's. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('author-initials');
const TOOLS = [
  { file: 'processing.html', name: 'Processing', key: 'ldh_processing_shift_v1', kind: 'processing_note' },
  { file: 'sick-injured.html', name: 'S&I', key: 'ldh_sickinjured_shift_v1', kind: 'si_note' }
];
const iso = d => d.toLocaleDateString('en-CA');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; };

async function run(tool) {
  const L = tool.name + ': ';
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const sent = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.aa) sent.push(body.aa);
    route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(body.aa ? { ok: true } : {}) });
  });
  const errors = [];
  try {
    // Night shift: vet AA creates the animal (registered, not sent).
    await ctx.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'AA'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); localStorage.setItem('__seeded', '1'); } });
    let page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto('file://' + path.resolve(__dirname, '..', tool.file)); await page.waitForTimeout(400);
    await page.evaluate(() => {
      const a = makeAnimal({ animalId: 'FICT-200', location: 'Cat Room 1', species: 'cat', weight: '4' });
      a.registered = true; state.animals.push(a); saveShift();
    });
    // Old data from before this change has no author stamp: strip it, and make the saved initials "yesterday's".
    await page.evaluate(({ key, yday }) => {
      const list = JSON.parse(localStorage.getItem(key)); list.forEach(a => { delete a.vetBy; delete a.nurseBy; });
      localStorage.setItem(key, JSON.stringify(list));
      localStorage.setItem('ldh_processing_vetinit_v1_day', yday);
    }, { key: tool.key, yday: iso(yesterday()) });
    // Next morning: vet BB opens the tool, is asked for initials, then sends what is still unsent.
    await page.reload(); await page.waitForSelector('#startShiftModal');
    await page.fill('#startShiftVet', 'bb'); await page.click('#startShiftSave');
    await page.waitForSelector('#startShiftModal', { state: 'detached' });
    t.ok((await page.inputValue('#vetInit')) === 'BB', L + 'the new vet is signed in as BB');
    await page.evaluate(() => aaSendAnimal(state.animals[0]));
    await page.waitForFunction(() => true); await page.waitForTimeout(500);
    t.ok(sent.length === 1, L + 'the note was sent: ' + sent.length);
    const s = sent[0] || { payload: {} };
    t.ok(s.sent_by === 'AA', L + 'sent under the first vet\'s initials, not the new vet\'s: ' + s.sent_by);
    const note = s.payload.text || '';
    t.ok(/\bAA\b/.test(note) && !/\bBB\b/.test(note), L + 'the note text carries AA and never BB: ' + JSON.stringify(note.slice(-120)));
    // An animal the new vet creates today carries the new vet's initials.
    await page.evaluate(() => { const a = makeAnimal({ animalId: 'FICT-201', location: 'Cat Room 1', species: 'cat', weight: '4' }); a.registered = true; state.animals.push(a); saveShift(); });
    const stamped = await page.evaluate(() => state.animals.map(a => a.animalId + ':' + a.vetBy));
    t.ok(stamped.includes('FICT-200:AA') && stamped.includes('FICT-201:BB'), L + 'each animal keeps its own vet: ' + stamped);
    // The stamp survives a reload (it is saved, not recomputed from whoever is signed in).
    await page.reload(); await page.waitForTimeout(400);
    t.ok((await page.evaluate(() => state.animals.map(a => a.animalId + ':' + a.vetBy))).join() === stamped.join(), L + 'the stamp survives a reload');
    t.ok(errors.length === 0, L + 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}
(async () => { for (const tool of TOOLS) await run(tool); t.done(); })();
