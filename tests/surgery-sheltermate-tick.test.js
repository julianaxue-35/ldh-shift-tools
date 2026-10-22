// Surgery: a registered (completed) note must be ticked off once it is entered on ShelterMate. Anything not ticked shows an
// "ENTER IT NOW" banner whenever the tool is opened. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-sheltermate-tick');
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('ldh_processing_vetinit_v1', 'JX'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); localStorage.setItem('__seeded', '1'); } });
  const page = await ctx.newPage(); const errs = [], dialogs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'surgery.html')); await page.waitForTimeout(400);
  const banner = () => page.evaluate(() => { const e = document.getElementById('smBanner'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : ''; });
  t.ok(!(await banner()), 'no banner when nothing is waiting');
  // Two completed notes (never ticked, as saved before this feature) and one still open
  await page.evaluate(() => {
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([
      { id: 'a1', animalId: 'FICT-1', registered: true }, { id: 'a2', animalId: 'FICT-2', registered: true }, { id: 'a3', animalId: 'FICT-3', registered: false }]));
  });
  await page.reload(); await page.waitForTimeout(500);
  const b1 = await banner();
  t.ok(/ENTER IT NOW/.test(b1) && /FICT-1/.test(b1) && /FICT-2/.test(b1) && !/FICT-3/.test(b1), 'on opening, the banner says ENTER IT NOW and names the two untouched completed notes: ' + b1.slice(0, 120));
  await page.click('#mainTabbar [data-tab="completed"]');
  t.ok(await page.locator('#completedList [data-smdone]').count() === 2, 'each completed note has an "Entered on ShelterMate" button');
  t.ok(await page.locator('#animalList [data-smdone]').count() === 0, 'open notes do not');
  await page.click('#completedList [data-smdone]');
  const b2 = await banner();
  t.ok(/FICT-2/.test(b2) && !/FICT-1/.test(b2), 'ticking one takes it off the banner: ' + b2.slice(0, 100));
  t.ok(await page.locator('#completedList [data-smundo]').count() === 1, 'a ticked note shows a done mark with an undo');
  await page.reload(); await page.waitForTimeout(500);
  t.ok(!/FICT-1/.test(await banner()) && /FICT-2/.test(await banner()), 'the tick survives a reload');
  await page.click('#mainTabbar [data-tab="completed"]');
  dialogs.length = 0; page.removeAllListeners('dialog'); page.once('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.click('#clearCompletedTabBtn'); await page.waitForTimeout(300);
  page.on('dialog', d => d.accept());
  t.ok(dialogs.some(d => /ShelterMate/i.test(d) && /FICT-2/.test(d)), 'clearing warns about a note not yet entered on ShelterMate: ' + dialogs.join('|').slice(0, 120));
  await page.click('#completedList [data-smundo]');
  t.ok(/FICT-1/.test(await banner()), 'undo puts it back on the banner');
  t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  await browser.close(); t.done();
})();
