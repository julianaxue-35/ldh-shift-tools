// 2026-11-23: dogs use the TAG NUMBER (3 letters + 3 numbers) as their ID in Processing and S&I; cats keep the shelter ID.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('dog-tag-number');
const TOOLS = [{ file: 'processing.html', name: 'Processing' }, { file: 'sick-injured.html', name: 'S&I' }];
(async () => {
  for (const tool of TOOLS) {
    const L = tool.name + ': ';
    const browser = await chromium.launch(); const ctx = await browser.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    try {
      await page.goto('file://' + path.resolve(__dirname, '..', tool.file)); await page.waitForTimeout(500);
      const labels = await page.evaluate(() => {
        const mk = (o) => (typeof makeAnimal === 'function' ? makeAnimal(o) : normalizeAnimal(Object.assign({ id: 'x' + Math.random() }, o)));
        return [mk({ species: 'dog', animalId: '1177720' }), mk({ species: 'dog', animalId: 'CZU627' }), mk({ species: 'dog', animalId: '' }), mk({ species: 'cat', animalId: '1177721' })].map(a => idLabelHtml(a));
      });
      t.ok(/use the tag.*CZU627/.test(labels[0]), L + 'a dog with a shelter number is told to use the tag: ' + labels[0]);
      t.ok(labels[1] === 'Tag number (dog)', L + 'a valid tag (CZU627) is accepted without a warning: ' + labels[1]);
      t.ok(/Tag number \(dog\).*needed/.test(labels[2]), L + 'an empty dog ID says needed: ' + labels[2]);
      t.ok(labels[3] === 'Animal ID', L + 'a cat keeps the plain Animal ID label: ' + labels[3]);
      t.ok(errors.length === 0, L + 'no page errors: ' + errors.join('; '));
    } finally { await browser.close(); }
  }
  t.done();
})();
