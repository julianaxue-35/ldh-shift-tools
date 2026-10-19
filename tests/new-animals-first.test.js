// Shift lists: animals added by hand with no ID yet come first (newest at the top), not buried in the middle of a room.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('new-animals-first');
const TOOLS = [
  ['sick-injured.html', '.room-group-hdr', (id, loc) => `makeAnimal({ animalId: '${id}', location: '${loc}', species: 'dog', weight: '10', noteText: '', otherReminders: [] })`],
  ['processing.html', '.room-group-hdr', (id, loc) => `makeAnimal({ animalId: '${id}', location: '${loc}', species: 'dog', weight: '10', noteText: '', otherReminders: [] })`],
  ['surgery.html', '.list-group-hdr', (id, loc) => `normalizeAnimal({ id: 'z${id}${loc}'.replace(/\\W/g,''), animalId: '${id}', species: 'cat', weight: '3', surgType: 'spey', location: '${loc}' })`]
];
(async () => {
  for (const [file, hdr, mk] of TOOLS) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
      localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    });
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto('file://' + path.resolve(__dirname, '..', file));
    await page.waitForTimeout(500);
    const code = `(() => { const a = ${mk('AAA111', 'Pound 1')}, b = ${mk('', 'Pound 1')}, c = ${mk('BBB222', 'Pound 2')}, d = ${mk('', 'Pound 3')}, e = ${mk('CCC333', 'Pound 1')};
      [a, b, c, d, e].forEach((x, i) => { x.id = x.id && x.id.length > 3 ? x.id : 'n' + i; if (!x.id) x.id = 'n' + i; });
      a.id = 'ida'; b.id = 'idb'; c.id = 'idc'; d.id = 'idd'; e.id = 'ide';
      state.animals = [a, b, c, d, e]; saveShift(); renderShiftList(); })()`;
    await page.evaluate(code);
    const heads = await page.$$eval('#animalList ' + hdr, hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
    t.ok(/^New . no ID yet/i.test(heads[0]) && /2/.test(heads[0]), file + ': the first group is "New - no ID yet" with both blank animals: ' + heads.join(' | '));
    const cards = await page.$$eval('#animalList .animal-card', cs => cs.map(c => c.querySelector('b').textContent.trim()));
    const noId = x => /\(no ID\)/.test(x);
    t.ok(noId(cards[0]) && noId(cards[1]) && cards.slice(2).every(x => !noId(x)) && cards.length === 5, file + ': the two with no ID are at the top of the list: ' + cards.join(','));
    const firstTwo = await page.$$eval('#animalList .animal-card [data-open]', bs => bs.slice(0, 2).map(b => b.dataset.open));
    t.ok(firstTwo.join() === 'idd,idb', file + ': newest first (the one added last is on top): ' + firstTwo.join());
    // once an ID is typed it moves into its room
    await page.evaluate(() => { const x = state.animals.find(a => a.id === 'idb'); x.animalId = 'DDD444'; saveShift(); renderShiftList(); });
    const cards2 = await page.$$eval('#animalList .animal-card', cs => cs.map(c => c.querySelector('b').textContent.trim()));
    t.ok(noId(cards2[0]) && !cards2.slice(1).some(noId), file + ': giving it an ID moves it into the list: ' + cards2.join(','));
    t.ok(errors.length === 0, file + ': no page errors ' + errors.join('; '));
    await browser.close();
  }
  t.done();
})();
