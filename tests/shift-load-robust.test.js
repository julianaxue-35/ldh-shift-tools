// One odd record in the saved list must not throw the whole list away (it used to: "Your saved list looked corrupted" and an
// older backup replaced it). Truly unreadable data still falls back to the backup. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('shift-load-robust');
const TOOLS = [['processing.html', 'ldh_processing_shift_v1'], ['sick-injured.html', 'ldh_sickinjured_shift_v1'], ['surgery.html', 'ldh_surgery_shift_v1']];
(async () => {
  for (const [file, key] of TOOLS) {
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await ctx.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('__seeded', '1'); } });
    const page = await ctx.newPage(); const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto('file://' + path.resolve(__dirname, '..', file)); await page.waitForTimeout(400);
    const good = { id: 'good', animalId: 'FICT-1', location: 'Cat Room 1', species: 'cat', weight: '4' };
    const seed = list => page.evaluate(([k, l]) => localStorage.setItem(k, JSON.stringify(l)), [key, list]);
    const ids = () => page.evaluate(() => state.animals.map(a => a && a.animalId));
    const L = file + ': ';
    await seed([good, null, { id: 'bad', animalId: 'FICT-2', nextStepNotes: 7, dental: 'yes', notes: 5 }]);
    dialogs.length = 0; await page.reload(); await page.waitForTimeout(500);
    t.ok(!dialogs.some(d => /corrupted/.test(d)), L + 'a null or oddly shaped record does not trigger the corrupted alert: ' + dialogs.join('|').slice(0, 80));
    const got = await ids();
    t.ok(got.includes('FICT-1') && got.includes('FICT-2') && !got.includes(null), L + 'every real animal is kept, the empty entry is dropped: ' + got);
    await page.evaluate(k => localStorage.setItem(k, '[{"id":"x","animalId":"Z"'), key);
    dialogs.length = 0; await page.reload(); await page.waitForTimeout(500);
    t.ok(dialogs.some(d => /corrupted/.test(d)), L + 'truly unreadable data still says so and falls back to the backup');
    await browser.close();
  }
  t.done();
})();
