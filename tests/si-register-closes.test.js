// Register in Sick & Injured sends the Register time so the dashboard closes the animal's request; undo sends nothing. Fictional data.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const t = require('./check')('si-register-closes');
const ROOT = path.resolve(__dirname, '..'), ORIGIN = 'https://ldh.test';
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext();
  const sent = [];
  await ctx.route(ORIGIN + '/**', route => {
    const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: p.endsWith('.html') ? 'text/html' : 'application/javascript', body: fs.readFileSync(p) });
  });
  await ctx.route(r => !r.toString().startsWith(ORIGIN), route => {
    const b = route.request().postData(); if (b) sent.push(JSON.parse(b));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: '{"ok":true,"done":[]}' });
  });
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(ORIGIN + '/sick-injured.html');
  await page.evaluate(() => { const a = makeAnimal({ animalId: 'FICT-1', location: 'Cat Room 1', species: 'cat', weight: '4' }); a.flagged = true; state.animals.push(a); saveShift(); document.getElementById('startShiftModal').remove(); openExam(a.id); });
  await page.click('#markDoneBtn'); await page.waitForTimeout(800);
  const done = sent.filter(b => b.title === 'FICT-1' && b.shift === 'sick_injured' && !b.care);
  t.ok(done.length === 1 && typeof done[0].registered_ago_ms === 'number', 'Register sends the Register time: ' + JSON.stringify(done));
  t.ok(await page.evaluate(() => !JSON.parse(localStorage.getItem(LS_SHIFT)).some(a => a.closeAt)), 'and it is cleared once the dashboard has it');
  sent.length = 0;
  await page.click('#markDoneBtn'); await page.waitForTimeout(500);
  t.ok(!sent.some(b => 'registered_ago_ms' in b), 'undoing sends no close');
  t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  await browser.close(); t.done();
})();
