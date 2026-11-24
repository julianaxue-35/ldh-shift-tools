// 2026-11-24: loading a handover file re-stamps unfinished animals with the LOADING vet's initials; animals the sender registered keep theirs.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const t = require('./check')('handover-restamp-vet');
const TOOLS = [{ file: 'processing.html', name: 'Processing', tool: 'processing' }, { file: 'sick-injured.html', name: 'S&I', tool: 'sick-injured' }];
(async () => {
  for (const tool of TOOLS) {
    const L = tool.name + ': ';
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    try {
      await page.goto('file://' + path.resolve(__dirname, '..', tool.file)); await page.waitForTimeout(500);
      const res = await page.evaluate(() => {
        const mk = (id, extra) => { const a = (typeof makeAnimal === 'function' ? makeAnimal : normalizeAnimal)(Object.assign({ id: 'h' + id, animalId: id, species: 'cat', location: 'Cat Room 1' }, extra)); a.vetBy = 'AB'; return a; };
        const open = mk('111111', {}); const edited = mk('222222', {}); edited.noteEdited = 'Date: 1/1    Vet: AB    Nurse: -\nsome note\n\nAB';
        const done = mk('333333', {}); done.doneElsewhere = true;
        const same = mk('444444', {}); same.vetBy = 'JX';
        const n = restampVetOnHandover([open, edited, done, same], 'JX');
        return { n, open: open.vetBy, edited: edited.vetBy, note: edited.noteEdited, done: done.vetBy, same: same.vetBy };
      });
      t.ok(res.open === 'JX' && res.edited === 'JX', L + 'unfinished animals take the loading vet\'s initials: ' + res.open + '/' + res.edited);
      t.ok(!/\bAB\b/.test(res.note) && /\nJX$/.test(res.note), L + 'a hand-edited note has the new initials in it: ' + JSON.stringify(res.note));
      t.ok(res.done === 'AB', L + 'an animal the sender already registered keeps the sender\'s initials');
      t.ok(res.n === 2, L + 'only the two changed animals are counted: ' + res.n);
      t.ok(errors.length === 0, L + 'no page errors: ' + errors.join('; '));
    } finally { await browser.close(); }
  }
  t.done();
})();
