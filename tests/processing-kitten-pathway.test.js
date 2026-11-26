// Single kitten check list: the next step, substatus and plan note follow the intake flow (confirmed 2026-11-26). Fictional animals.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('processing-kitten-pathway');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  try {
    await page.goto('file://' + path.resolve(__dirname, '../processing.html')); await page.waitForTimeout(500);
    const S = 'Awaiting sort', F = 'Awaiting foster', E = 'Awaiting euthanasia', SUB = 'Awaiting foster for stray period';
    const QUAR = 'Awaiting foster during quarantine period.', MGMT = 'Confirm with management if foster is available.';
    const NOID = 'Stray (no ID)', ID = 'Stray (with ID)', SUR = 'Surrender';
    // [what, weight, kc, tattoo, step, substatus, note]
    const table = [
      ['has ID', '0.5', { reason: ID }, '', S, '', MGMT],
      ['tattoo on a stray', '2', { reason: NOID }, 'YES', S, '', MGMT],
      ['has ID, tiny', '0.15', { reason: ID }, '', S, '', MGMT],
      ['200 g', '0.2', { reason: NOID }, '', E, '', ''],
      ['300 g healthy, carer', '0.3', { reason: NOID, health: 'healthy', neoCarer: 'Y' }, '', F, '', ''],
      ['300 g healthy, no carer', '0.3', { reason: NOID, health: 'healthy', neoCarer: 'N' }, '', E, '', ''],
      ['300 g unwell', '0.3', { reason: NOID, health: 'one' }, '', E, '', ''],
      ['under 8 weeks', '0.5', { reason: NOID, health: 'healthy', age: '5' }, '', F, '', ''],
      ['400 g one condition', '0.4', { reason: NOID, health: 'one', age: '5' }, '', F, '', ''],
      ['not suitable', '0.8', { reason: NOID, health: 'not', age: '10', litter: 'single' }, '', E, '', ''],
      ['8-16 weeks single', '1', { reason: NOID, health: 'healthy', age: '10', litter: 'single' }, '', S, SUB, ''],
      ['8-16 weeks pair', '1', { reason: NOID, health: 'healthy', age: '10', litter: 'pair' }, '', F, '', ''],
      ['over 16 weeks', '2', { reason: NOID, health: 'healthy', age: '20' }, '', S, '', ''],
      ['surrender single 8-16', '1', { reason: SUR, health: 'healthy', age: '10', litter: 'single' }, '', F, '', QUAR],
      ['surrender under 8', '0.5', { reason: SUR, health: 'healthy', age: '5' }, 'YES', F, '', QUAR],
      ['nothing chosen yet', '1', {}, '', '', '', ''],
      ['7.5 weeks counts as under 8', '0.7', { reason: NOID, health: 'healthy', age: '7.5' }, '', F, '', ''],
      ['exactly 8 weeks single', '0.9', { reason: NOID, health: 'healthy', age: '8 weeks', litter: 'single' }, '', S, SUB, ''],
      ['16 weeks pair', '1.8', { reason: NOID, health: 'healthy', age: '16', litter: 'pair' }, '', F, '', ''],
      ['3 months single', '1.2', { reason: NOID, health: 'healthy', age: '3 months', litter: 'single' }, '', S, SUB, ''],
      ['5 months', '2.2', { reason: NOID, health: 'healthy', age: '5 months' }, '', S, '', ''],
      ['40 days', '0.5', { reason: NOID, health: 'healthy', age: '40 days' }, '', F, '', '']
    ];
    for (const [what, weight, kc, tt, step, sub, extra] of table) {
      const r = await page.evaluate(({ weight, kc, tt }) => {
        const a = makeAnimal({ animalId: 'K', species: 'cat', weight }); a.checklist = 'kitten'; a.tt = tt; Object.assign(a.kc, kc);
        state.animals = [a]; saveShift(); renderShiftList(); openExam(a.id);
        return { step: a.nextStep, note: document.getElementById('noteDisplay').textContent, select: document.getElementById('fld_nextstep').value };
      }, { weight, kc, tt });
      const subOk = sub ? r.note.includes('Substatus: ' + sub) : !r.note.includes('Substatus: Awaiting');
      const noteOk = [QUAR, MGMT].every(x => r.note.includes(x) === (extra === x));
      t.ok(r.step === step && r.select === step && subOk && noteOk, what + ' -> ' + (step || 'blank') + (sub ? ' + ' + sub : '') + (r.step === step && subOk && noteOk ? '' : ' (got ' + r.step + ', subOk ' + subOk + ', noteOk ' + noteOk + ')'));
    }
    // by tapping, as the vet does
    await page.evaluate(() => { const a = makeAnimal({ animalId: 'T', species: 'cat', weight: '1' }); a.id = 'T'; a.checklist = 'kitten'; state.animals = [a]; saveShift(); renderShiftList(); openExam('T'); });
    const tap = (k, v) => page.click(`[data-set="kc.${k}"][data-val="${v}"]`);
    t.ok(/To fill in the next step, add/.test(await page.textContent('#examBody')), 'says what is still needed');
    await tap('reason', NOID); await tap('health', 'healthy'); await page.fill('[data-kc="age"]', '10'); await page.evaluate(() => document.activeElement.blur()); await tap('litter', 'single');
    t.ok((await page.inputValue('#fld_nextstep')) === S && await page.evaluate(() => awaitingFoster(state.animals[0])), 'single 8-16 weeks: Awaiting sort, and still a foster priority for the Admission AA');
    await tap('litter', 'pair');
    t.ok((await page.inputValue('#fld_nextstep')) === F, 'changing the answer changes the step');
    await page.selectOption('#fld_nextstep', 'Awaiting rescue'); await tap('litter', 'single');
    t.ok((await page.inputValue('#fld_nextstep')) === 'Awaiting rescue' && !/stray period/.test(await page.textContent('#noteDisplay')), 'a step she picks herself stays, without the flow substatus');
    await page.click('#useFlowStepBtn');
    t.ok((await page.inputValue('#fld_nextstep')) === S, 'one tap goes back to the intake flow step');
    await tap('health', 'not');
    t.ok((await page.inputValue('#fld_nextstep')) === E && (await page.inputValue('#fld_ongoing')) === '', 'euthanasia step: no ongoing care typed in');
    t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  } finally { await browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 500)); process.exit(1); });
