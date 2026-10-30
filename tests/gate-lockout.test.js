// Access gate: a locked-out network (HTTP 429 from the server) gets a clear message, a wrong code (401) still says incorrect,
// and a locked network is never let in.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('gate-lockout');

(async () => {
  const browser = await chromium.launch();
  for (const file of ['surgery.html', 'processing.html', 'sick-injured.html', 'dental.html', 'index.html']) {
    for (const [status, expect] of [[429, /Too many wrong attempts/], [401, /Incorrect code/]]) {
      const ctx = await browser.newContext();
      await ctx.route('**/*', r => {
        const u = r.request().url();
        if (u.startsWith('file:')) return r.continue();
        if (u.includes('/functions/v1/')) return r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
        return r.abort();
      });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('file://' + path.resolve(__dirname, '../' + file));
      await page.fill('#ldh-gate-input', 'whatever');
      await page.click('#ldh-gate-btn');
      await page.waitForFunction(() => { const e = document.getElementById('ldh-gate-err'); return e && getComputedStyle(e).display !== 'none' && /\S/.test(e.textContent); });
      t.ok(expect.test(await page.textContent('#ldh-gate-err')), `${file}: ${status} shows the right message`);
      t.ok(await page.evaluate(() => !localStorage.getItem('ldhGateOk_v2')), `${file}: ${status} does not unlock`);
      t.ok(errors.length === 0, `${file}: no page errors`);
      await ctx.close();
    }
  }
  await browser.close();
  t.done();
})();
