// Sick & Injured: "Full physical exam" template (cat / dog / exotic) is an option on the exam screen; Revisit stays the default. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('si-full-pe');
const FILE = 'file://' + path.resolve(__dirname, '../sick-injured.html');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', (route) => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  // an OLD-shape saved animal: none of the template fields exist, so the load-time defaults must fill them in
  const seed = [{ id: 'a1', animalId: 'PE-1', location: 'Cat Room 1 / 3', species: 'cat', weight: '3.2', noteEdited: null, history: 'Picked up from dashboard', exam: { demeanour: '', eating: '', urinating: '', defecating: '', free: '' } }];
  await ctx.addInitScript((a) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx');
    localStorage.setItem('ldh_sickinjured_shift_v1', JSON.stringify(a));
    localStorage.setItem('ldh_sickinjured_shift_v1_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }));
  }, seed);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE); await page.waitForTimeout(400);
  await page.evaluate(() => { const m = document.getElementById('startShiftModal'); if (m) { m.classList.add('hidden'); m.style.display = 'none'; } });
  const noteText = () => page.evaluate(() => document.getElementById('noteDisplay').textContent);
  try {
    await page.evaluate(() => openExam('a1'));
    t.ok(await page.locator('#fld_examTemplate').inputValue() === 'revisit', 'Revisit is the default template');
    t.ok(await page.locator('[data-demeanour]').count() > 0 && await page.locator('[data-nsfkey]').count() === 0, 'Revisit shows the demeanour exam, not the PE');
    await page.selectOption('#fld_examTemplate', 'pe'); await page.waitForTimeout(150);
    t.ok(await page.locator('[data-nsfkey]').count() === 8 && await page.locator('[data-demeanour]').count() === 0, 'Full PE shows the 8 system boxes');
    t.ok(await page.locator('[data-pespecies].selected').getAttribute('data-pespecies') === 'cat', 'species defaults from the animal (cat)');
    await page.click('[data-nsfkey="eyes"]'); await page.fill('[data-noteskey="eyes"]', 'L ocular discharge'); await page.waitForTimeout(100);
    await page.click('[data-nekey="ears"]');
    await page.click('[data-dentalgrade="2"]');
    await page.click('[data-heartmurmur]'); await page.click('[data-heartgrade="3/6"]');
    await page.selectOption('#fld_sex', 'M'); await page.selectOption('#fld_pedesex', 'ENTIRE'); await page.click('[data-testes="Bilateral"]');
    await page.fill('#fld_bcs', '4'); await page.fill('#fld_vhc', '2'); await page.waitForTimeout(150);
    let n = await noteText();
    t.ok(/Cat physical exam/.test(n), 'note names the species exam');
    t.ok(/Eyes: L ocular discharge/.test(n), 'abnormal eyes with its note');
    t.ok(/Ears: Not able to examine/.test(n), 'ears not able to examine');
    t.ok(/Nose: NSF/.test(n) && /Neurological: NSF/.test(n), 'untouched systems are NSF');
    t.ok(/Teeth: Dental Grade 2\/4/.test(n), 'dental grade');
    t.ok(/Heart: Murmur grade 3\/6/.test(n), 'heart murmur grade');
    t.ok(/Testes: Bilateral/.test(n) && /BCS: 4\/5/.test(n) && /VHC: 2\/6/.test(n), 'testes, BCS and VHC');
    t.ok(/Examination:[\s\S]*Eyes/.test(n) && /Assessment:/.test(n) && /Treatment \/ Fees:/.test(n), 'S&I note sections are intact around the PE');
    // exotic: incisors and molars instead of a dental grade
    await page.click('[data-pespecies="exotic"]'); await page.waitForTimeout(150);
    t.ok(await page.locator('[data-dentalpart]').count() === 6 && await page.locator('[data-dentalgrade]').count() === 0, 'exotic shows incisors / molars');
    await page.click('[data-dentalpart="incisors"][data-val="ABN"]'); await page.waitForTimeout(100);
    n = await noteText();
    t.ok(/Exotic physical exam/.test(n) && /Teeth: Incisors Abnormal; Molars -/.test(n), 'exotic teeth wording');
    // saved with the animal and survives reopening; back to Revisit works
    await page.evaluate(() => { document.getElementById('closeExamBtn').click(); openExam('a1'); });
    t.ok(await page.locator('#fld_examTemplate').inputValue() === 'pe' && await page.locator('[data-nsfkey]').count() === 8, 'the template choice is remembered for the animal');
    await page.selectOption('#fld_examTemplate', 'revisit'); await page.waitForTimeout(150);
    t.ok(await page.locator('[data-demeanour]').count() > 0, 'can switch back to Revisit');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  } finally { await browser.close(); }
  t.done();
})();
