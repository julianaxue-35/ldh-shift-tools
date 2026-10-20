// Surgery: initials are cleared on a new day and asked for at the start of the shift; they are shared with the other shift tools.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-start-of-shift');
const today = new Date().toLocaleDateString('en-CA');
async function page(browser, init, file) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (window.__g) return; window.__g = 1; localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); });
  await ctx.addInitScript(init);
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '..', file || 'surgery.html'));
  await p.waitForTimeout(500);
  return { p, errors, ctx };
}
(async () => {
  const browser = await chromium.launch();
  // 1. a new day: yesterday's initials are cleared and the vet is asked
  let { p, errors, ctx } = await page(browser, () => { if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1'); localStorage.setItem('ldh_processing_vetinit_v1', 'OLD'); localStorage.setItem('ldh_processing_vetinit_v1_day', '2020-01-01'); localStorage.setItem('ldh_surgery_nurseinit_v1', JSON.stringify({ d: '2020-01-01', v: 'NN' })); });
  t.ok(await p.locator('#startShiftModal').count() === 1, 'a new day: the start-of-shift box appears');
  t.ok((await p.inputValue('#vetInit')) === '' && (await p.inputValue('#nurseInit')) === '', 'yesterday\'s vet and nurse initials are cleared');
  await p.click('#startShiftSave');
  t.ok(/needed/.test(await p.textContent('#startShiftErr')) && await p.locator('#startShiftModal').count() === 1, 'the vet initials are required');
  await p.fill('#startShiftVet', 'jx'); await p.fill('#startShiftNurse', 'ab'); await p.click('#startShiftSave');
  t.ok(await p.locator('#startShiftModal').count() === 0 && (await p.inputValue('#vetInit')) === 'JX' && (await p.inputValue('#nurseInit')) === 'AB', 'saving fills the Vet and Nurse boxes');
  const stored = await p.evaluate(() => [localStorage.getItem('ldh_processing_vetinit_v1'), localStorage.getItem('ldh_processing_vetinit_v1_day')]);
  t.ok(stored[0] === 'JX' && stored[1] === today, 'stored under the same key the other tools use, for today');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  // the other tools then do not ask again and show the same vet
  const sp = await ctx.newPage(); await sp.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await sp.goto('file://' + path.resolve(__dirname, '../sick-injured.html')); await sp.waitForTimeout(500);
  t.ok(await sp.locator('#startShiftModal').count() === 0 && (await sp.inputValue('#vetInit')) === 'JX', 'Sick & Injured does not ask again and already has the initials');
  await ctx.close();
  // 2. started earlier today in another tool: Surgery keeps the initials and does not ask
  ({ p, errors, ctx } = await page(browser, () => { localStorage.setItem('ldh_processing_vetinit_v1', 'KL'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); }));
  t.ok(await p.locator('#startShiftModal').count() === 0 && (await p.inputValue('#vetInit')) === 'KL', 'already started today (e.g. in Processing): no box, the initials carry over');
  t.ok(errors.length === 0, 'no page errors');
  await ctx.close();
  await browser.close();
  t.done();
})();
