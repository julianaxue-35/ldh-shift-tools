// Sick & Injured: how many of the list the dashboard has been told about, and one button to send the whole list again.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('si-dash-status');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = []; let fail = false;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    posts.push(body);
    if (fail) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[]}' });
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../sick-injured.html'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const mk = (id, loc, extra) => Object.assign(makeAnimal({ animalId: id, location: loc, species: 'dog', weight: '10', noteText: '', otherReminders: [] }), { id: 'x' + id }, extra);
    state.animals = [mk('S-1', 'Pound 1', { dashTitle: 'S-1', dashLoc: 'Pound 1' }), mk('S-2', 'Pound 1', { dashTitle: 'S-2', dashLoc: 'Pound 1' }),
      mk('K-1', 'Pound 2', { dashOff: true }), mk('N-1', 'Pound 3'), mk('N-2', ''), mk('REG-1', 'Pound 4', { registered: true, noteEdited: 'n', dashTitle: 'REG-1', dashLoc: 'Pound 4' })];
    saveShift(); renderShiftList();
  });
  const txt = async () => (await page.textContent('#dashStatus')).replace(/\s+/g, ' ');
  let s = await txt();
  t.ok(/6 on this list/.test(s) && /3 sent/.test(s) && /1 kept off the dashboard/.test(s) && /2 not sent yet/.test(s), 'the list says how many the dashboard has been told about: ' + s);
  posts.length = 0;
  await page.click('#dashResendBtn');
  await page.waitForFunction(() => /Sent 6/.test(document.getElementById('dashResendMsg').textContent));
  const items = posts.find(b => b.items).items;
  t.ok(items.length === 6 && items.some(i => i.title === 'K-1') && items.some(i => i.title === 'N-2' && i.location === 'Location TBC') && items.every(i => i.shift === 'sick_injured'), 'one send carries the whole list, including kept-off and no-location animals');
  t.ok(posts.some(b => b.title === 'REG-1'), 'a registered animal is re-sent as done');
  s = await txt();
  t.ok(/6 sent/.test(s) && !/not sent yet|kept off/.test(s), 'afterwards every animal counts as sent: ' + s);
  // offline: says so, changes nothing
  await page.evaluate(() => { state.animals[3].dashTitle = ''; state.animals[2].dashOff = true; saveShift(); renderShiftList(); });
  fail = true;
  await page.click('#dashResendBtn');
  await page.waitForFunction(() => /Could not reach/.test(document.getElementById('dashResendMsg').textContent));
  t.ok(/not sent yet/.test(await txt()) && /kept off/.test(await txt()), 'if the dashboard cannot be reached it says so and the counts do not change');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
