// Surgery: two vets on a high-volume desexing day (2026-11-25): one does castrates, one speys; each note shows its own vet.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-two-vets');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'AA'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  try {
    await page.goto('file://' + path.resolve(__dirname, '../surgery.html')); await page.waitForTimeout(500);
    await page.evaluate(() => {
      const mk = (id, surgType, extra) => normalizeAnimal(Object.assign({ id, animalId: id, species: 'cat', weight: '3', surgType, addedDay: shareDate() }, extra));
      state.animals = [mk('C1', 'castrate'), mk('S1', 'spey'), mk('CR', 'cryptorchid'), mk('P1', 'pyometra'), mk('D1', 'dental'), mk('DONE', 'spey', { registered: true }), mk('STARTED', 'spey', { surgStart: '09:00' })];
      saveShift(); renderShiftList();
    });
    const vets = () => page.evaluate(() => Object.fromEntries(state.animals.map(a => [a.id, vetOf(a)])));
    const set = async (sel, v) => { await page.fill(sel, v); await page.locator(sel).blur(); };
    t.ok(!(await page.isVisible('#vetSplit')), 'with one vet there is nothing extra on screen');
    await set('#vetInit2', 'bb');
    t.ok(await page.isVisible('#vetSplit'), 'typing a second vet shows who does what');
    let v = await vets();
    t.ok(v.C1 === 'AA' && v.CR === 'AA' && v.S1 === 'BB' && v.P1 === 'BB' && v.D1 === 'AA', 'castrates and cryptorchids to vet 1, speys and pyometras to vet 2: ' + JSON.stringify(v));
    t.ok(v.DONE === 'AA' && v.STARTED === 'AA', 'animals already completed or started keep their vet');
    await page.selectOption('#split_castrate', 'BB'); await page.selectOption('#split_spey', 'AA'); v = await vets();
    t.ok(v.C1 === 'BB' && v.S1 === 'AA' && v.DONE === 'AA', 'swapping the designation moves only the waiting ones');
    await page.evaluate(() => openExam('S1'));
    await page.selectOption('#examVetPick', 'BB'); v = await vets();
    t.ok(v.S1 === 'BB' && v.P1 === 'AA', 'one animal can be changed on its own');
    t.ok(/Vet: BB /.test(await page.textContent('#noteDisplay')) && !/AA/.test((await page.textContent('#noteDisplay')).split('\n')[1]), 'its note shows only its own vet');
    await page.evaluate(() => document.getElementById('closeExamBtn').click());
    await page.selectOption('#split_spey', 'AA'); v = await vets();
    t.ok(v.S1 === 'BB', 'a hand-picked vet is not overwritten');
    await page.evaluate(() => { state.animals.push(normalizeAnimal({ id: 'NEW', animalId: 'NEW', species: 'dog', surgType: 'spey', addedDay: shareDate() })); saveShift(); renderShiftList(); });
    t.ok((await vets()).NEW === 'AA', 'an animal added later gets the right vet');
    await page.evaluate(() => { const a = state.animals.find(x => x.id === 'NEW'); a.surgType = 'castrate'; saveShift(); });
    t.ok((await vets()).NEW === 'BB', 'changing the procedure changes the vet');
    await page.evaluate(() => { const a = state.animals.find(x => x.id === 'P1'); a.noteEdited = assembleNote(a) + '\nmy own words'; saveShift(); });
    await page.selectOption('#split_spey', 'BB');
    const edited = await page.evaluate(() => state.animals.find(x => x.id === 'P1').noteEdited);
    t.ok(/Vet: BB /.test(edited) && /my own words/.test(edited), 'a hand-edited note gets the new vet and keeps her wording');
    await page.reload(); await page.waitForTimeout(500);
    t.ok((await page.inputValue('#vetInit2')) === 'BB' && (await page.inputValue('#split_spey')) === 'BB' && (await vets()).S1 === 'BB', 'it is remembered for the day');
    await set('#vetInit2', ''); v = await vets();
    t.ok(!(await page.isVisible('#vetSplit')) && v.P1 === 'AA' && v.NEW === 'AA' && v.DONE === 'AA', 'removing the second vet hands the waiting animals back: ' + JSON.stringify(v));
    // two nurses work the same way, alongside the vets
    await set('#vetInit2', 'BB'); await set('#nurseInit', 'nn'); await set('#nurseInit2', 'mm');
    const nurses = () => page.evaluate(() => Object.fromEntries(state.animals.map(a => [a.id, nurseOf(a)])));
    let n = await nurses();
    t.ok(n.C1 === 'nn'.toUpperCase() || n.C1 === 'NN' || n.C1 === 'nn', 'castrates go to nurse 1: ' + n.C1);
    t.ok(n.P1 === 'MM' && (await page.isVisible('#split_n_spey')) && (await page.isVisible('#split_spey')), 'speys and pyometras go to nurse 2, shown beside the vet choices');
    await page.selectOption('#split_n_spey', 'NN'); t.ok((await nurses()).P1 === 'NN' && (await vets()).P1 !== 'NN', 'swapping nurses leaves the vets alone');
    await page.evaluate(() => openExam('P1'));
    await page.selectOption('#examNursePick', 'MM');
    t.ok(/Nurse: MM/.test(await page.textContent('#noteDisplay')), 'one animal can have its nurse changed, and its note shows it');
    await page.evaluate(() => document.getElementById('closeExamBtn').click());
    t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  } finally { await browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 500)); process.exit(1); });
