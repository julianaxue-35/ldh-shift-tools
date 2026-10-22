// Browser storage full: the vet must be told the change was NOT saved (it used to fail silently), and old backups are
// dropped first to make room. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('shift-save-full');
const TOOLS = [['processing.html', 'ldh_processing_shift_v1'], ['sick-injured.html', 'ldh_sickinjured_shift_v1'], ['surgery.html', 'ldh_surgery_shift_v1']];
(async () => {
  for (const [file, key] of TOOLS) {
    const L = file + ': ';
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await ctx.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('__seeded', '1'); } });
    const page = await ctx.newPage(); const dialogs = [], errs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', file)); await page.waitForTimeout(400);
    // 1. full only because of old backups: dropping them makes room, nothing is lost, nobody is alarmed
    await page.evaluate(([k]) => {
      localStorage.setItem(k + '_backups', '[{"ts":1,"data":[]}]');
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (n, v) { if (n === k && this.getItem(k + '_backups')) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, n, v); };
      state.animals.push({ id: 'a1', animalId: 'FICT-1' }); saveShift();
    }, [key]);
    t.ok(JSON.parse(await page.evaluate(k => localStorage.getItem(k), key)).some(a => a.animalId === 'FICT-1'), L + 'saved after the old backups were dropped');
    t.ok(!dialogs.length && !errs.length, L + 'no alarm when dropping backups was enough: ' + dialogs.join('|') + errs.join('|'));
    // 2. really full: say so, once, and do not crash
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; state.animals.push({ id: 'a2', animalId: 'FICT-2' }); saveShift(); saveShift(); });
    t.ok(dialogs.length === 1 && /NOT (been )?saved|could NOT be saved/i.test(dialogs[0]), L + 'told once that the change was not saved: ' + dialogs.length + ' ' + (dialogs[0] || '').slice(0, 60));
    t.ok(errs.length === 0, L + 'no page error: ' + errs.join('|'));
    await browser.close();
  }
  t.done();
})();
