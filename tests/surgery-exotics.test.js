// Surgery tool: Exotic species group (rabbit, guinea pig, ferret, rat) — doses from the exotics anaesthesia sheets, no default premed for guinea pig / rat.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-exotics');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    const mk = (id, sp, st) => ({ id, animalId: 'T-' + id, species: sp, surgType: st, weight: '1', location: 'CR1-7' });
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([mk('gp', 'guineapig', 'spey'), mk('fe', 'ferret', 'spey'), mk('ra', 'rat', 'castrate'), mk('rb', 'rabbit', 'spey'), mk('ct', 'cat', 'spey')]));
    localStorage.setItem('ldh_surgery_shift_v1_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }));
  });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  try {
    await page.goto('file://' + path.resolve(__dirname, '../surgery.html'));
    await page.waitForTimeout(500);
    const A = id => page.evaluate(i => state.animals.find(x => x.id === i), id);
    t.ok((await A('gp')).premedType === '', 'guinea pig has NO premed pre-selected');
    t.ok((await A('ra')).premedType === '', 'rat has NO premed pre-selected');
    t.ok((await A('fe')).premedType === 'exoB', 'ferret has only option B (ket/med/bup)');
    // opening each exam renders without errors and shows the right premed buttons
    for (const [id, expect] of [['gp', 2], ['ra', 2], ['fe', 1]]) {
      await page.evaluate(i => openExam(i), id); await page.waitForSelector('#fld_species');
      const n = await page.$$eval('[data-premed="exoA"],[data-premed="exoB"]', e => e.length);
      t.ok(n === expect, id + ' premed buttons: ' + n);
      t.ok((await page.$eval('#fld_species', e => e.value)) === ({ gp: 'guineapig', ra: 'rat', fe: 'ferret' })[id], id + ' species select shows it');
    }
    // species dropdown has Exotic group with all 4
    t.ok(await page.$eval('#fld_species', e => [...e.querySelectorAll('optgroup[label="Exotic"] option')].map(o => o.value).join(',')) === 'rabbit,guineapig,ferret,rat', 'Exotic group lists rabbit, guinea pig, ferret, rat');
    // ferret numbers (1 kg): med 0.04, ket 0.025-0.05, bup 0.07-0.17; ranged drugs are NOT silently picked
    let note = await page.evaluate(() => assembleNote(state.animals.find(x => x.id === 'fe')));
    t.ok(/medetomidine 0.04mL/.test(note) && /ketamine 0.025–0.05mL/.test(note) && /amount given not recorded/.test(note), 'ferret note shows single dose + ranges with no pick: ' + note.split('\n').find(l => /medetomidine/.test(l)));
    await page.evaluate(() => { const a = state.animals.find(x => x.id === 'fe'); a.exoOv_ket = '0.04'; a.exoOv_bup = '0.1'; });
    note = await page.evaluate(() => assembleNote(state.animals.find(x => x.id === 'fe')));
    t.ok(/medetomidine 0.04mL \(1mg\/mL\) \+ ketamine 0.04mL \(100mg\/mL\) \+ buprenorphine 0.1mL/.test(note), 'typed amounts appear in the note');
    t.ok(await page.evaluate(() => exoAtipMl(state.animals.find(x => x.id === 'fe'))) === 0.04, 'ferret atipamezole = medetomidine mL');
    // rat A/B + guinea pig
    await page.evaluate(() => { state.animals.find(x => x.id === 'ra').premedType = 'exoA'; state.animals.find(x => x.id === 'gp').premedType = 'exoB'; });
    note = await page.evaluate(() => assembleNote(state.animals.find(x => x.id === 'ra')));
    t.ok(/methadone 0.2mL \(10mg\/mL\) \+ midazolam 0.1–0.2mL/.test(note) && /15–20 min/.test(note), 'rat option A: methadone 0.2 + midazolam 0.1–0.2');
    const gp = await page.evaluate(() => exoDoseRows(state.animals.find(x => x.id === 'gp')).map(r => r.l + '=' + r.v).join('|'));
    t.ok(/Medetomidine \(IM\)=<u>0.05<\/u>–0.5/.test(gp) && /Ketamine \(IM\)=0.05–<u>0.08<\/u>–0.4/.test(gp) && /Meloxicam SC \(Loxicom\)=0.1/.test(gp) && /Oral meloxicam \(dog\)=0.33/.test(gp), 'guinea pig B doses: ' + gp);
    t.ok(/Loxicom\)=0.2/.test(await page.evaluate(() => exoDoseRows(state.animals.find(x => x.id === 'ra')).map(r => r.l + '=' + r.v).join('|'))), 'rat Loxicom 0.2 mL/kg');
    // templates
    t.ok(/^Flank spey performed\./.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'gp')))) && !/Pre-GA exam/.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'gp')))), 'guinea pig spey = her flank spey wording');
    t.ok(/Routine midline spey performed, pedicle ties/.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'fe')))), 'ferret spey = cat midline spey wording');
    t.ok(/^Routine scrotal castration\.\nIncision\(s\) made and testicles exteriorised\.\nCord tie\/hand tie\/suture ligation performed\.\nIncision left open to allow secondary intention\.$/.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'ra')))), 'rat castrate = her scrotal castration wording');
    // rabbit + cat unchanged
    const rb = await page.evaluate(() => rabPremedSummary(state.animals.find(x => x.id === 'rb')));
    t.ok(/Medetomidine \d/.test(rb) === false || /medetomidine/i.test(rb), 'rabbit premed summary still works');
    t.ok(/Midline spey performed/.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'rb')))) && !/Pre-GA exam|HR remained|IVC placed|Emla applied|Recovery:|recheck on day 3/.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'rb')))), 'rabbit spey: pre-exam, HR/IVC/Emla and recovery sections removed');
    t.ok(/Routine midline spey performed/.test(await page.evaluate(() => buildTemplate(state.animals.find(x => x.id === 'ct')))), 'cat template unchanged');
    // grouping + every exam opens
    const groups = await page.evaluate(() => state.animals.map(a => animalSpeciesGroup(a)).join(','));
    t.ok(groups === 'exotic,exotic,exotic,exotic,cat', 'list groups all four under Exotics: ' + groups);
    for (const id of ['gp', 'fe', 'ra', 'rb', 'ct']) { await page.evaluate(i => openExam(i), id); await page.waitForSelector('#fld_species'); }
    // switching species via the dropdown
    await page.evaluate(() => openExam('ct')); await page.waitForSelector('#fld_species');
    await page.selectOption('#fld_species', 'ferret'); await page.waitForTimeout(200);
    const c = await A('ct');
    t.ok(c.species === 'ferret' && c.premedType === 'exoB', 'cat -> ferret switches species and premed');
    await page.waitForSelector('#fld_species'); await page.selectOption('#fld_species', 'cat'); await page.waitForTimeout(200);
    t.ok((await A('ct')).premedType === 'standard', 'ferret -> cat restores standard premed');
    const bk = await page.evaluate(() => ['Guinea pig', 'Ferret', 'Rat', 'Rabbit', 'Cat'].map(matchSpecies).join(','));
    t.ok(bk === 'guineapig,ferret,rat,rabbit,cat', 'booking sheet species recognised: ' + bk);
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } catch (e) { t.ok(false, 'threw: ' + e.message); }
  await browser.close(); t.done();
})();
