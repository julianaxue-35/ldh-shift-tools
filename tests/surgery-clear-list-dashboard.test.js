// Surgery "Clear list": animals not yet registered also come off the dashboard (so the Surgery ring stops counting them);
// registered ones are left alone (they stay counted as done).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-clear-list-dashboard');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const deletes = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (body.delete) deletes.push(body.delete);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
  });
  const animals = [
    { id: 'a1', animalId: 'S-1', species: 'cat', surgType: 'spey', registered: true, location: 'Surgery' },
    { id: 'a2', animalId: 'S-2', species: 'dog', surgType: 'dental', registered: false, location: 'Surgery' },
    { id: 'a3', animalId: 'S-3', species: 'cat', registered: false, location: '' }
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
  await page.waitForTimeout(1500);
  deletes.length = 0;
  await page.click('#clearListBtn');
  await page.waitForTimeout(800);
  t.ok(await page.evaluate(() => state.animals.length) === 0, 'the list is cleared');
  t.ok(deletes.length === 2 && deletes.every(d => d.shift === 'surgery'), 'two dashboard removals sent: ' + JSON.stringify(deletes));
  t.ok(deletes.some(d => d.title === 'S-2' && d.location === 'Surgery') && deletes.some(d => d.title === 'S-3' && d.location === 'Location TBC'), 'unregistered animals removed, blank location uses the placeholder');
  t.ok(!deletes.some(d => d.title === 'S-1'), 'the registered animal stays on the dashboard as done');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
