// "A newer version is available": the vet is mid-note, so the banner must (1) let them go back to their shift, (2) save what they
// are typing before reloading, and (3) refresh the tool's other script files too, so the new page never runs against stale
// cached copies (that mismatch is what crashed the new version). Fictional data only.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const t = require('./check')('update-banner');
const ROOT = path.resolve(__dirname, '..'), ORIGIN = 'https://ldh.test';
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const TOOLS = [['processing.html', 'ldh_processing_shift_v1'], ['sick-injured.html', 'ldh_sickinjured_shift_v1'], ['surgery.html', 'ldh_surgery_shift_v1']];
(async () => {
  for (const [file, key] of TOOLS) {
    const L = file + ': ';
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.route(ORIGIN + '/**', route => {
      const u = new URL(route.request().url()); const p = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(p);
      if (u.searchParams.has('_vcheck')) body = Buffer.from(String(body).replace(/(const APP_VERSION\s*=\s*')[^']+'/, "$1NEW-VERSION'"));
      route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body });
    });
    await ctx.route(r => !r.toString().startsWith(ORIGIN), r => r.abort());
    await ctx.addInitScript(() => {
      if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('__seeded', '1'); }
      const real = window.fetch; window.fetch = function (u, o) { try { const l = JSON.parse(sessionStorage.getItem('__f') || '[]'); l.push([String(u), o && o.cache]); sessionStorage.setItem('__f', JSON.stringify(l)); } catch (e) {} return real.apply(this, arguments); };
    });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(ORIGIN + '/' + file); await page.waitForSelector('#updateBanner', { timeout: 8000 });
    t.ok(await page.locator('#updateLaterBtn').count() === 1, L + 'the banner has a "Later" button so the vet can go back to their shift');
    await page.click('#updateLaterBtn');
    t.ok(await page.locator('#updateBanner').count() === 0, L + 'Later hides the banner');
    // back after a re-check? not for a while
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    t.ok(await page.locator('#updateBanner').count() === 0, L + 'it does not nag again straight away');
    t.ok(errs.length === 0, L + 'no page errors: ' + errs.join('; '));
    await browser.close();
  }
  // The Reload button itself: saves typing, refreshes sibling scripts first.
  {
    const file = 'processing.html', key = 'ldh_processing_shift_v1', L = 'processing.html reload: ';
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.route(ORIGIN + '/**', route => {
      const u = new URL(route.request().url()); const p = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(p);
      if (u.searchParams.has('_vcheck')) body = Buffer.from(String(body).replace(/(const APP_VERSION\s*=\s*')[^']+'/, "$1NEW-VERSION'"));
      route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body });
    });
    await ctx.route(r => !r.toString().startsWith(ORIGIN), r => r.abort());
    await ctx.addInitScript(() => {
      if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('ldh_processing_vetinit_v1', 'JX'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); localStorage.setItem('__seeded', '1'); }
      const real = window.fetch; window.fetch = function (u, o) { try { const l = JSON.parse(sessionStorage.getItem('__f') || '[]'); l.push([String(u), o && o.cache]); sessionStorage.setItem('__f', JSON.stringify(l)); } catch (e) {} return real.apply(this, arguments); };
    });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(ORIGIN + '/' + file); await page.waitForSelector('#updateBanner', { timeout: 8000 });
    // an animal with a note field being typed in (no blur yet)
    await page.evaluate(() => { const a = makeAnimal({ animalId: 'FICT-9', location: 'Cat Room 1', species: 'cat', weight: '4' }); state.animals.push(a); saveShift(); openExam(a.id); });
    await page.waitForTimeout(400);
    const ta = page.locator('#examModal textarea, #examBody textarea, textarea').first();
    await ta.click(); await ta.pressSequentially('typed just before the update');
    await page.click('#updateReloadBtn');
    await page.waitForURL(/_r=/, { timeout: 8000 }); await page.waitForTimeout(500);
    const saved = await page.evaluate(k => localStorage.getItem(k) || '', key);
    t.ok(/typed just before the update/.test(saved), L + 'what was being typed is saved before the page reloads');
    t.ok(errs.length === 0, L + 'no page errors after the reload: ' + errs.join('; '));
    // sibling scripts are refreshed from the server (not served from a stale cache) before going to the new version
    await page.goto(ORIGIN + '/' + file); await page.waitForSelector('#updateBanner');
    await page.evaluate(() => sessionStorage.removeItem('__f'));
    await page.click('#updateReloadBtn'); await page.waitForURL(/_r=/, { timeout: 8000 });
    const fetched = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__f') || '[]').filter(f => /\.js(\?|$)/.test(f[0]) && f[1] === 'reload').map(f => f[0].split('/').pop()));
    t.ok(['medchart.js', 'dash-sync.js', 'aa-share.js'].every(n => fetched.includes(n)), L + 'the other script files are re-fetched fresh before reloading: ' + fetched.join(','));
    await browser.close();
  }
  t.done();
})();
