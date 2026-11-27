// Processing: the vet can swap a cat's exam for the Kitten Intake or the Queen and Litter check list (2026-11-25).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('processing-kitten-checklists');
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
    await page.evaluate(() => {
      const mk = (id, species) => Object.assign(makeAnimal({ animalId: id, location: 'Cat Room 1', species, weight: '0.5' }), { id });
      state.animals = [mk('K-1', 'cat'), mk('Q-1', 'cat'), mk('D-1', 'dog')]; saveShift(); renderShiftList(); openExam('K-1');
    });
    const note = () => page.textContent('#noteDisplay');
    const pick = async (sel, v) => { await page.selectOption(sel, v); };
    const type = async (sel, v) => { await page.fill(sel, v); await page.evaluate(() => document.activeElement && document.activeElement.blur()); };
    const inOrder = (text, lines) => { let at = 0; for (const l of lines) { const i = text.indexOf(l, at); if (i < 0) return 'missing: ' + l; at = i + l.length; } return ''; };

    t.ok(/PHYSICAL EXAM/.test(await note()), 'the standard cat exam is still the default');
    const tap = (set, v) => page.click(`[data-set="${set}"][data-val="${v}"]`);
    const plan = key => page.click(`[data-planopt="${key}"]`);
    await pick('#fld_checklist', 'kitten');
    t.ok(!/wormer|Physical exam and/i.test(await note()), 'no treatment is claimed until it is tapped');
    await tap('kc.reason', 'Stray (no ID)'); await tap('kc.ip', 'N'); await tap('tt', 'NO');
    await type('#fld_weight', '');
    t.ok(!/microchip|GA|Desex/i.test(await page.inputValue('#fld_ongoing')), 'no weight yet: no microchip, exam or desexing line');
    await type('#fld_weight', '0.5');
    let o = await page.inputValue('#fld_ongoing');
    t.ok(/^Worming every 2 weeks\.\nFlea treatment and vaccination every 4 weeks\.\nFull physical exam under GA at surgery\.\nMicrochip at 600 g\.$/.test(o), 'under 600 g: the ongoing plan is already typed: ' + JSON.stringify(o));
    await type('#fld_weight', '0.65');
    t.ok(!/Microchip at 600/.test(await page.inputValue('#fld_ongoing')) && /microchip now/.test(await page.textContent('#examBody')), '600 g or over: asked to microchip now instead');
    await type('#fld_weight', '0.75');
    t.ok((await page.locator('#fld_pathway').count()) === 1 && (await page.locator('#fld_bcs').count()) === 1 && (await page.locator('[data-kc]').count()) === 0 && (await page.locator('#fld_ongoing').count()) === 0, 'from 750 g: the plain normal PE form, nothing from the intake template');
    const full = await note();
    t.ok(/CAT PHYSICAL EXAM/.test(full) && /Physical Exam:\nEyes: NSF/.test(full) && !/KITTEN INTAKE|Desex at due out|RTP|Substatus|Intake reason/.test(full), 'and the plain normal PE note');
    await type('#fld_weight', '0.5');
    t.ok((await page.locator('[data-planopt]').count()) === 0, 'no buttons for the ongoing plan');
    await page.click('#chipNaBtn');
    t.ok(/next step in pathway \(this is the status change\)/.test(await page.textContent('#examBody')), 'prompts for the next step');
    await type('[data-kc="colour"]', 'black and white');
    await tap('kc.physical', 'NSF'); await tap('kc.heart', 'Normal heart sounds'); await tap('bcs', '3'); await type('[data-kc="other"]', 'Active'); await tap('uvLamp', 'NEGATIVE');
    await tap('fasScore', '0'); await tap('kc.rtp', '0');
    await page.click('[data-treatmentitem="Wormer"]'); await page.click('[data-treatmentitem="Flea treatment"]');
    await tap('kc.plan', 'OK for juvenile foster'); await pick('#fld_nextstep', 'Awaiting foster'); await type('#fld_medplan', 'None');
    let n = await note();
    let bad = inOrder(n, ['KITTEN INTAKE CHECK LIST', 'INTAKE REASON: Stray (no ID)', 'IP: N', 'M/C: N/A', 'Tattoo: N', 'Colour: black and white', 'Sex: Updated on file', 'Age: Updated on file', 'Weight: Updated on file',
      'PHYSICAL', 'Eyes, Ears, Nose, Mouth, Coat: NSF', 'Heart: Normal heart sounds', 'BCS: 3', 'Other: Active', 'Woodslamp: NEGATIVE', 'BEHAVIOUR:', 'FAS (0-5): 0', 'RTP (0-5): 0',
      'VET TREATMENTS GIVEN:', 'Wormer', 'Flea treatment', 'Medication plan (if required): None', 'PLAN: OK for juvenile foster', 'Worming every 2 weeks.', 'Flea treatment and vaccination every 4 weeks.', 'Full physical exam under GA at surgery.', 'Microchip at 600 g.', 'Next step in pathway: Awaiting foster', 'Initial: jx']);
    t.ok(!bad, 'kitten note has her headings and the entries, in order ' + bad);
    await type('#fld_ongoing', 'My own plan.');
    await type('#fld_weight', '0.6');
    t.ok(/My own plan\./.test(await note()) && (await page.inputValue('#fld_ongoing')) === 'My own plan.', 'once she types in it, her wording stays');
    await page.click('#ongoingResetBtn');
    t.ok(/under GA/.test(await page.inputValue('#fld_ongoing')), 'the standard wording can be put back');
    await type('#fld_weight', '0.5');
    await tap('kc.plan', 'Medical euthanasia');
    t.ok(!/every 2 weeks|every 4 weeks/.test(await note()), 'no ongoing schedule when the plan is euthanasia');
    await tap('kc.plan', 'OK for juvenile foster'); await type('#fld_weight', '0.5');
    t.ok(!/ASSESSMENT:|WAIVERS|Urogenital/.test(await note()), 'and nothing from the standard exam');
    t.ok(await page.locator('#markDoneBtn').isVisible() && await page.locator('[data-regchart]').isVisible(), 'register and medication chart buttons are there');

    // added from the Shift List, like any new animal
    await page.evaluate(() => document.getElementById('closeExamBtn').click());
    await page.click('#addQueenBtn');
    t.ok((await page.inputValue('#fld_checklist')) === 'queen' && /QUEEN AND LITTER/.test(await note()), '"+ Queen and neos" adds one with her check list open');
    t.ok((await page.inputValue('#fld_location')) === 'Cat transport', 'location starts as Cat transport');
    t.ok((await page.inputValue('#fld_nextstep')) === 'Awaiting sort' && /Next step in pathway: Awaiting sort/.test(await note()), 'queen and neos start at Awaiting sort');
    t.ok((await page.locator('[data-kc="colour"]').count()) === 0, 'no colour box for the queen');
    await tap('fasScore', '4');
    t.ok(/Substatus: Behaviour review required/.test(await note()), 'FAS 4 ticks behaviour review required by itself');
    await page.click('#behReviewBtn');
    t.ok(!/Behaviour review required/.test(await note()), 'and it can be unticked');
    await tap('fasScore', '5');
    t.ok(/Substatus: Behaviour review required/.test(await note()), 'a new score of 5 ticks it again');
    await tap('fasScore', '1');
    t.ok(!/Behaviour review required/.test(await note()), 'a low score does not tick it');
    await page.click('#behReviewBtn');
    t.ok(/Substatus: Behaviour review required/.test(await note()), 'but it can be added by hand');
    await page.click('#behReviewBtn');
    await tap('fasScore', '1');
    await type('#fld_animalid', 'Q-2');
    await tap('kc.reason', 'Surrender'); await tap('kc.ip', 'N'); await tap('kc.physical', 'NSF'); await tap('uvLamp', 'NEGATIVE'); await type('#fld_behaviour', 'Settled'); await tap('fasScore', '1');
    await tap('kc.flea', 'Y'); await tap('kc.worm', 'Y'); await tap('kc.vacc', 'N');
    await tap('kc.litterWood', 'NEGATIVE'); await pick('#fld_nextstep', 'Awaiting foster for stray period');
    const neo = (i, key, v) => type(`[data-neo="${i}:${key}"]`, v), neoTap = (i, v) => page.click(`[data-neoset="${i}:health"][data-val="${v}"]`);
    await page.click('[data-neocount="4"]');
    t.ok((await page.locator('[data-neo$=":id"]').count()) === 4 && (await page.locator('[data-neo$=":colour"]').count()) === 4, 'picking 4 gives four shelter number and colour boxes');
    await type('[data-kc="litterAge"]', '3');
    t.ok(/Vet Treatments \(if appropriate\): No treatment given/.test(await note()) && (await page.locator('[data-littertx]').count()) === 4, 'under 4 weeks with no weights: no treatment filled in, treatments still on offer');
    await neo(0, 'id', '900401'); await neo(0, 'colour', 'black'); await neoTap(0, 'Healthy'); await neo(0, 'weight', '250 g');
    t.ok((await page.locator('[data-neo="1:note"]').count()) === 0, 'no free text until a neo is unhealthy');
    await neo(1, 'id', '900402'); await neo(1, 'colour', 'tabby'); await neoTap(1, 'Unhealthy'); await neo(1, 'note', 'sneezing');
    n = await note();
    bad = inOrder(n, ['QUEEN AND LITTER INTAKE CHECK LIST', 'QUEEN:', 'Intake Reason/hx: Surrender', 'Flea: Y', 'Worm: Y', 'Vacc: N',
      'NEOS/KITTENS:', 'Number: 4', 'Age: 3 weeks', 'Woods Lamp: NEGATIVE', 'Vet Treatments (if appropriate): No treatment given', '1. 900401, -, black: Healthy. Weight: 250 g', '2. 900402, -, tabby: Unhealthy (sneezing). Weight: -', '4. -, -, -: -. Weight: -',
      'PLAN:', 'Queen plan:', 'Send queen to foster with neos when due out.', 'Return for surgery when kittens are weaned.', 'Vaccination due again in 2 weeks.', 'Worming and flea treatment every month.', 'Kitten plan:', 'Return at 4 weeks old for treatments.', 'Full physical exam at the time of surgery.', 'Microchip at 600 g, or at the time of surgery.', 'Next step in pathway: Awaiting foster for stray period', 'Initials: jx']);
    t.ok(!bad, 'queen and neos note: litter details, a line per neo, then both plans ' + bad);
    t.ok(!/congenital/i.test(n + (await page.textContent('#examBody'))), 'no congenital option');
    await type('[data-kc="litterAge"]', '5');
    t.ok(/Under 400 g usually gets no treatment/.test(await page.textContent('#examBody')), 'all weighed neos under 400 g: no treatment is the default whatever the age');
    await neo(2, 'weight', '380 g'); await neo(0, 'weight', '400 g');
    t.ok(/Some are 400 g or over, some under/.test(await page.textContent('#examBody')) && !/No treatment given/.test(await note()), 'a mixed litter: nothing assumed, she is asked to choose');
    await neo(0, 'weight', '380 g');
    for (const x of ['Vaccine', 'Worming', 'Flea treatment']) await page.click(`[data-littertx="${x}"]`);
    t.ok(!/No treatment given/.test(await note()), 'she can treat kittens under 400 g if she chooses');
    await page.click('[data-littertx="No treatment given"]');
    t.ok(/Vet Treatments \(if appropriate\): No treatment given\n/.test(await note()), 'or choose no treatment, which replaces the others');
    for (const x of ['Vaccine', 'Worming', 'Flea treatment']) await page.click(`[data-littertx="${x}"]`);
    t.ok(/Vet Treatments \(if appropriate\): Vaccine, Worming, Flea treatment/.test(await note()), 'taps fill in the treatments');
    t.ok(!/Return at 4 weeks old/.test(await page.inputValue('#fld_ongoing')), 'no "return at 4 weeks" once they are 4 weeks or older');
    t.ok((await page.locator('[data-neoeuth="0"]').count()) === 0 && (await page.locator('[data-neoeuth="1"]').count()) === 1, 'only an unhealthy neo offers humane euthanasia');
    await page.click('[data-neoeuth="1"]'); n = await note();
    t.ok(/2\. 900402, -, tabby: Unhealthy \(sneezing\)\. Weight: -\. Pathway: humane euthanasia/.test(n) && /Kitten plan:\nHumane euthanasia: 900402\./.test(n) && /Send queen to foster with neos/.test(n) && /Microchip at 600 g/.test(n), 'it shows on that neo and in the kitten plan, the others keep their plan');
    await neoTap(1, 'Healthy');
    t.ok(!/euthanasia/i.test(await note()), 'marking it healthy removes the euthanasia');
    await neoTap(1, 'Unhealthy'); await page.click('[data-neoeuth="1"]');
    for (const i of [0, 2, 3]) { await neoTap(i, 'Unhealthy'); await page.click(`[data-neoeuth="${i}"]`); }
    n = await note();
    t.ok(/Humane euthanasia: 900401, 900402, neo 3, neo 4\./.test(n) && !/foster with neos|kittens are weaned|surgery\.|Microchip at 600/.test(n) && /Vaccination due again/.test(n), 'if all are for euthanasia, no kitten care or foster-with-neos lines remain');
    for (const i of [0, 2, 3]) await neoTap(i, 'Healthy');
    // a note for each kitten, written from the queen's entry
    await neo(0, 'weight', '450 g'); await page.click('[data-neoset="0:sex"][data-val="F"]'); await page.click('[data-neoset="1:sex"][data-val="M"]');
    const own = () => page.evaluate(() => neoNotesFor(state.animals.find(a => a.animalId === 'Q-2')));
    let kits = await own();
    t.ok(kits.length === 4 && kits[0].id === '900401', 'one note per neo');
    bad = inOrder(kits[0].text, ['Animal ID: 900401', 'Location: Cat transport', 'Weight: 450 g', 'Vet: jx', 'Queen: Q-2', 'Sex: F', 'Colour: black', 'Age: 5 weeks', 'Health: Healthy', 'Woods Lamp: NEGATIVE', 'Vet treatments: Vaccine, Worming, Flea treatment', 'PLAN:', 'Full physical exam at the time of surgery.', 'Microchip at 600 g, or at the time of surgery.', 'Next step in pathway:', 'Initials: jx']);
    t.ok(!bad && !/Queen plan|Send queen/.test(kits[0].text), 'with that kitten\'s details, the litter treatments and the kitten plan only ' + bad);
    t.ok(/Substatus: Physical exam at surgery/.test(kits[0].text), 'each kitten under 750 g is marked for a physical exam at surgery');
    t.ok(/Health: Unhealthy \(sneezing\)/.test(kits[1].text) && /Sex: M/.test(kits[1].text), 'each note has its own health and sex');
    t.ok((await page.locator('[data-neocopy]').count()) === 4, 'a Copy button for each kitten');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.click('[data-neocopy="0"]'); await page.waitForTimeout(300);
    t.ok(/Copied/.test(await page.textContent('[data-neocopy="0"]')), 'copy works');
    const word = await page.evaluate(async () => { const a = state.animals.find(x => x.animalId === 'Q-2'); const f = await buildWordFile({ only: [a] }); const zip = await JSZip.loadAsync(f); return (await zip.file('word/document.xml').async('string')); }).catch(e => 'ERR ' + e.message);
    t.ok(!/^ERR/.test(word) && ['900401', '900402', 'Queen: Q-2'].every(x => word.includes(x)), 'the Word file has a page per kitten ' + word.slice(0, 120));
    await neo(1, 'id', '900999'); await neo(1, 'colour', 'ginger');
    t.ok(/900999/.test(await page.locator('#neoNotes summary').nth(1).textContent()) && /Colour: ginger/.test(await page.locator('[data-neotext="1"]').textContent()), 'the kitten previews update as she types');
    await type('[data-kc="litterAge"]', '2');
    t.ok((await own()).length === 0 && /stay in the mum.s note/.test(await page.textContent('#neoNotes')), 'under 3 weeks: they stay in the mum\'s note');
    await type('[data-kc="litterAge"]', '5');
    await page.click('[data-neocount="1"]');
    t.ok(/Number: 1\n/.test(await note()) && !/900402/.test(await note()), 'the number can be reduced');
    await page.evaluate(() => document.getElementById('closeExamBtn').click());
    await page.click('#addKittenBtn');
    t.ok((await page.inputValue('#fld_checklist')) === 'kitten' && (await page.inputValue('#fld_location')) === 'Cat transport', '"+ Kitten processing" adds one with the kitten check list, at Cat transport');
    t.ok((await page.inputValue('#fld_treatments')) === '' && !/CAT PHYSICAL EXAM/.test(await note()), 'a newly added kitten starts with no treatments filled in');
    await page.reload(); await page.waitForTimeout(500);
    await page.evaluate(() => openExam('K-1'));
    t.ok((await page.inputValue('#fld_checklist')) === 'kitten' && /INTAKE REASON: Stray \(no ID\)/.test(await note()), 'the choice and entries survive a reload');
    await pick('#fld_checklist', '');
    t.ok(/PHYSICAL EXAM/.test(await note()) && await page.locator('#fld_pathway').isVisible(), 'she can switch back to the standard exam');
    await page.evaluate(() => openExam('D-1'));
    t.ok((await page.locator('#fld_checklist').count()) === 0, 'dogs have no check list choice');
    // an animal saved before this change still opens
    await page.evaluate(() => { const a = state.animals.find(x => x.id === 'K-1'); delete a.checklist; delete a.kc; normalizeAnimal(a); openExam('K-1'); });
    t.ok(/PHYSICAL EXAM/.test(await note()), 'older saved animals open as before');
    // reopening the tool with saved kitten and queen notes that were registered and sent must load cleanly
    await page.evaluate(() => {
      const mk = (id, checklist, weight) => { const a = makeAnimal({ animalId: id, species: 'cat', weight }); a.checklist = checklist; a.registered = true; a.aaSentAt = new Date().toISOString(); a.aaSig = 'x'; a.nextStep = 'Awaiting sort'; return a; };
      state.animals = [mk('R-1', 'kitten', '0.5'), mk('R-2', 'kitten', '1.4'), mk('R-3', 'queen', '3')]; saveShift(); localStorage.setItem('ldh_aa_share_processing', '1');
    });
    await page.reload(); await page.waitForTimeout(2500);
    t.ok(errs.length === 0 && await page.evaluate(() => state.animals.length === 3 && typeof openExam === 'function' && !!usesIntakeForm), 'saved check lists load cleanly: ' + errs.join('; '));
    for (const i of [0, 1, 2]) await page.evaluate(i => openExam(state.animals[i].id), i);
    t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  } finally { await browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).split('\n')[0]); process.exit(1); });
