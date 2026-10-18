// Surgery tool: each registered surgery is reported (species + procedure only) for the dashboard's surgery stats.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-log');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const logs = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.surgery_log) logs.push(body.surgery_log);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
  });
  const animals = [
    { id: 'a1', animalId: 'S-1', species: 'cat', surgType: 'spey', registered: true, location: 'Surgery' },
    { id: 'a2', animalId: 'S-2', species: 'dog', surgType: 'dental', registered: true, location: 'Surgery' },
    { id: 'a3', animalId: 'S-3', species: 'rabbit', surgType: 'castrate', surgType2: 'dental', registered: false, location: 'Surgery' }
  ];
  await ctx.addInitScript((as) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    if (!localStorage.getItem('ldh_surgery_shift_v1')) {
      localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify(as));
      localStorage.setItem('ldh_surgery_shift_v1_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }));
    }
  }, animals);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../surgery.html'));
  await page.waitForTimeout(3500);

  // catch-up: every already-registered surgery is reported once the page is open
  const reg = logs.filter(l => l.registered !== false);
  t.ok(reg.length === 2 && reg.some(l => l.source_id === 'a1' && l.species === 'cat' && l.surg_type === 'spey') && reg.some(l => l.source_id === 'a2' && l.species === 'dog' && l.surg_type === 'dental'), 'registered surgeries are reported on load: ' + JSON.stringify(logs));
  t.ok(logs.every(l => !('animal_id' in l) && !('animalId' in l) && !('name' in l)), 'no animal ID or name is sent');

  // registering the third one reports it, with its second procedure
  logs.length = 0;
  await page.evaluate(() => { const a = state.animals.find(x => x.id === 'a3'); a.registered = true; saveShift(); syncSurgeryLog(a); });
  await page.waitForTimeout(300);
  t.ok(logs.length === 1 && logs[0].source_id === 'a3' && logs[0].species === 'rabbit' && logs[0].surg_type === 'castrate' && logs[0].surg_type2 === 'dental' && logs[0].registered === true, 'registering reports species + both procedures: ' + JSON.stringify(logs));

  // un-registering removes it from the stats
  logs.length = 0;
  await page.evaluate(() => { const a = state.animals.find(x => x.id === 'a3'); a.registered = false; saveShift(); syncSurgeryLog(a); });
  await page.waitForTimeout(300);
  t.ok(logs.length === 1 && logs[0].source_id === 'a3' && logs[0].registered === false, 'un-registering removes it: ' + JSON.stringify(logs));
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
