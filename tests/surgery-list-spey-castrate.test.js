// 2026-11-24: Surgery tool list: inside each species, speys / castrates / other procedures are grouped.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-list-spey-castrate');
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  try {
    await page.goto('file://' + path.resolve(__dirname, '..', 'surgery.html')); await page.waitForTimeout(500);
    const html = await page.evaluate(() => {
      const mk = (id, sp, st) => normalizeAnimal({ id: 'q' + id, animalId: id, species: sp, surgType: st, weight: '4' });
      return groupedListHtml([mk('111111', 'cat', 'castrate'), mk('222222', 'cat', 'spey'), mk('333333', 'cat', 'preg1'), mk('CZU627', 'dog', 'castrate'), mk('CZU628', 'dog', 'cryptorchid'), mk('CZU629', 'dog', 'pyometra')]);
    });
    const hdrs = [...html.matchAll(/class="list-(?:group|kind)-hdr"[^>]*>([^<]+)</g)].map(m => m[1].trim());
    t.ok(hdrs.join('|') === '🐱 Cats (3)|Speys (2)|Castrates (1)|🐕 Dogs (3)|Castrates (2)|Other procedures (1)', 'headers: ' + hdrs.join(' | '));
    t.ok(html.indexOf('222222') < html.indexOf('111111') && html.indexOf('333333') < html.indexOf('111111'), 'cat speys (incl. pregnant) come before the cat castrate');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
