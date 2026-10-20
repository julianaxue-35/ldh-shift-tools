// "Hold for possible match" is a pathway choice in Sick & Injured, Surgery and Processing.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('pathway-hold-match');
const OPT = 'Hold for possible match';
(async () => {
  const browser = await chromium.launch();
  for (const file of ['sick-injured.html', 'surgery.html', 'processing.html']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto('file://' + path.resolve(__dirname, '..', file)); await page.waitForTimeout(500);
    if (file === 'processing.html') {
      t.ok(await page.evaluate(o => NEXT_STEP_OPTIONS.includes(o) && PATHWAY_OPTIONS_28.includes(o), OPT), file + ': in the next-step list and the 28-day pathway list');
    } else {
      const html = await page.evaluate(() => {
        const a = (typeof makeAnimal === 'function' && document.title !== 'Surgery Notes') ? makeAnimal({ animalId: 'P-1', location: 'Pound 1', species: 'dog', weight: '10', noteText: '', otherReminders: [] }) : normalizeAnimal({ id: 'p1', animalId: 'P-1', species: 'cat', weight: '3', surgType: 'spey', location: 'S1' });
        state.animals = [a]; saveShift(); renderShiftList(); openExam(a.id);
        const sel = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => /Awaiting triage/.test(o.text)));
        return sel ? Array.from(sel.options).map(o => o.text) : [];
      });
      t.ok(html.includes(OPT) && html.indexOf(OPT) === html.indexOf('Hold in vet care') + 1, file + ': offered in the pathway dropdown, right after "Hold in vet care": ' + html.slice(0, 3).join(' | '));
    }
    t.ok(errors.length === 0, file + ': no page errors ' + errors.join('; '));
    await ctx.close();
  }
  await browser.close();
  t.done();
})();
