// Surgery: the microchip number now syncs between the stations (it still never goes to the dashboard).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-microchip-sync');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = [];
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/functions/v1/clever-endpoint')) {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
      posts.push(route.request().postData() || '');
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[]}' });
    }
    return route.abort();
  });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../surgery.html')); await page.waitForTimeout(500);
  const NUM = '956000012345678';
  const r = await page.evaluate((num) => {
    const a = normalizeAnimal({ id: 'm1', animalId: 'CHIP-1', species: 'cat', weight: '3', surgType: 'spey', location: 'S1', microchipNum: num });
    a.ticks.microchip = { done: true, time: '' }; a.needs.chip = true;
    state.animals = [a]; saveShift();
    const out = stripForSync(a);
    return { sentNum: out.microchipNum, implanted: out.microchipImplanted, localOnly: SHARE_LOCAL_ONLY_KEYS.slice(), locked: chipEntryLocked(Object.assign({}, a, { chipTickRemote: true, microchipNum: '' })), note: assembleNote(a) };
  }, NUM);
  t.ok(r.sentNum === NUM && r.implanted === true, 'the number goes with the animal to the other stations: ' + r.sentNum);
  t.ok(!r.localOnly.includes('microchipNum'), 'it is no longer on the stay-on-this-device list');
  t.ok(r.locked === false, 'a station that only received the tick is no longer locked out of the number');
  t.ok(r.note.includes('Microchip: ' + NUM), 'the note shows the number');
  // the number never goes to the dashboard
  await page.evaluate(() => { const a = state.animals[0]; a.registered = true; saveShift(); syncCompletionToDashboard(a, 'surgery'); syncSurgeryLogAll(); });
  await page.waitForTimeout(800);
  t.ok(posts.length > 0 && !posts.some(p => p.includes('956000012345678')), 'nothing sent to the dashboard contains the number (' + posts.length + ' sends checked)');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
