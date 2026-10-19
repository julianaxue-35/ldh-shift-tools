// Surgery tool: BCS belongs to the physical exam under GA, so it only appears for animals that need a physical exam.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-bcs');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
  });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../surgery.html'));
  await page.waitForTimeout(500);
  const mk = (id, hc, bcs) => `(() => { const a = normalizeAnimal({ id: '${id}', animalId: '${id}', species: 'cat', weight: '3', surgType: 'spey', location: 'Surgery', bcs: '${bcs}', needs: { hc: ${hc} } }); return a; })()`;
  await page.evaluate(({ a, b }) => { state.animals = [eval(a), eval(b)]; saveShift(); renderShiftList(); }, { a: mk('NOPE-1', false, '3.5'), b: mk('HC-1', true, '3.5') });

  // an animal that does NOT need a physical exam: no BCS box, no BCS in the note
  await page.evaluate(() => openExam('NOPE-1'));
  t.ok(await page.locator('#fld_bcs').count() === 0, 'no BCS box for an animal that does not need a physical exam');
  const note1 = await page.evaluate(() => assembleNote(state.animals.find(x => x.id === 'NOPE-1')));
  t.ok(!/BCS/.test(note1), 'and no BCS in its note (not even the old vitals line): ' + (note1.match(/HR:.*/) || [''])[0]);

  // an animal that does: the BCS box is in the physical exam under GA, and the note carries it with that exam
  await page.evaluate(() => openExam('HC-1'));
  t.ok(await page.locator('#fld_bcs').count() === 1, 'a BCS box appears for an animal that needs a physical exam');
  t.ok(await page.evaluate(() => !!document.getElementById('fld_bcs').closest('details#sec-intra')), 'and it is inside the physical exam section under GA, not the general vitals');
  t.ok((await page.inputValue('#fld_bcs')) === '3.5', 'a BCS already entered is kept');
  await page.selectOption('#fld_bcs', '4');
  await page.waitForTimeout(200);
  const note2 = await page.evaluate(() => assembleNote(state.animals.find(x => x.id === 'HC-1')));
  const lines = note2.split('\n');
  const pe = lines.findIndex(l => /PHYSICAL EXAM at SX/.test(l)), bcs = lines.findIndex(l => l === 'BCS: 4/5'), gender = lines.findIndex(l => /^Gender:/.test(l));
  t.ok(pe >= 0 && bcs > pe && bcs < gender, 'the note lists BCS in the physical exam, before Gender: ' + lines.slice(pe, pe + 14).join(' | ').slice(0, 200));
  t.ok(!/CRT:.*BCS/.test(note2), 'not on the general vitals line');
  // a physical-exam animal with no BCS yet shows a dash
  await page.selectOption('#fld_bcs', '');
  await page.waitForTimeout(200);
  t.ok(/\nBCS: -\n/.test(await page.evaluate(() => assembleNote(state.animals.find(x => x.id === 'HC-1')))), 'no BCS entered yet: the physical exam shows a dash');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
