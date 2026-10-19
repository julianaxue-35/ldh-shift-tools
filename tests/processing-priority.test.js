// Processing: send a note to the Admission AA as PRIORITY (ticked automatically for "Awaiting foster").
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('processing-priority');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const sent = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.aa) sent.push(body.aa);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body.aa ? { ok: true } : { ok: true, done: [] }) });
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    localStorage.setItem('ldh_aa_share_processing', '1');
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../processing.html'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const mk = (id, step) => Object.assign(makeAnimal({ animalId: id, location: 'Cat Room 1', species: 'cat' }), { id, nextStep: step || '', noteEdited: 'Note for ' + id });
    state.animals = [mk('F-1', 'Awaiting foster'), mk('N-1', 'Hold in vet care'), mk('F-2', '')];
    saveShift(); renderShiftList(); AAShare.setOn('processing', true); renderAaShare();
  });

  // 1. awaiting foster => ticked automatically; others are not
  await page.evaluate(() => openExam('F-1'));
  t.ok(await page.isChecked('.aa-priority-chk'), 'an animal awaiting foster has PRIORITY ticked for her');
  t.ok(/because this animal is awaiting foster/.test(await page.textContent('#examBody')), 'and says why');
  await page.evaluate(() => openExam('N-1'));
  t.ok(!(await page.isChecked('.aa-priority-chk')), 'any other animal is not priority by default');

  // 2. registering sends the flag
  await page.evaluate(() => { const a = state.animals.find(x => x.id === 'F-1'); a.registered = true; aaAfterRegister(a); });
  await page.waitForFunction(() => window.__x = 1);
  await page.waitForTimeout(500);
  t.ok(sent.length === 1 && sent[0].animal_id === 'F-1' && sent[0].payload.priority === true, 'the awaiting-foster note is sent with priority: ' + JSON.stringify(sent[0] && sent[0].payload && sent[0].payload.priority));
  await page.evaluate(() => { const a = state.animals.find(x => x.id === 'N-1'); a.registered = true; aaAfterRegister(a); });
  await page.waitForTimeout(500);
  t.ok(sent.length === 2 && sent[1].payload.priority === undefined, 'a normal note is sent without it');

  // 3. she can tick it herself for any animal, and her choice stands
  await page.evaluate(() => openExam('F-2'));
  await page.check('.aa-priority-chk');
  await page.evaluate(() => { const a = state.animals.find(x => x.id === 'F-2'); a.registered = true; aaAfterRegister(a); });
  await page.waitForTimeout(500);
  t.ok(sent.length === 3 && sent[2].payload.priority === true, 'a priority ticked by hand is sent');

  // 4. changing it after sending shows "changed since sent" and the resend carries the new value
  await page.evaluate(() => openExam('F-1'));
  await page.uncheck('.aa-priority-chk');
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => { const a = state.animals.find(x => x.id === 'F-1'); return AAShare.status(a, aaSigText(a)); });
  t.ok(st === 'stale', 'unticking after it was sent marks it changed, so it can be resent: ' + st);
  await page.evaluate(() => aaSendAnimal(state.animals.find(x => x.id === 'F-1')));
  await page.waitForTimeout(500);
  t.ok(sent.length === 4 && sent[3].animal_id === 'F-1' && sent[3].payload.priority === undefined, 'the resend drops the priority');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
