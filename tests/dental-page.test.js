// Dental chart page: pick words, see abbreviations, one PDF per animal, and the Surgery note fills itself in.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const t = require('./check')('dental-page');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (window.__seeded) return; window.__seeded = true;
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    if (!localStorage.getItem('ldh_surgery_shift_v1')) localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([
      { id: 'a1', animalId: 'T-SPEY', species: 'cat', surgType: 'spey', weight: '3' },
      { id: 'a2', animalId: 'T-DENT', species: 'dog', surgType: 'dental', weight: '20' },
      { id: 'a3', animalId: 'T-RAB', species: 'rabbit', surgType: 'castrate', weight: '2' },
      { id: 'a4', animalId: 'T-CAT', species: 'cat', surgType: 'dental', weight: '4' }
    ]));
  });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../dental.html'));
  await page.waitForSelector('#animalPick');

  const opts = await page.$$eval('#animalPick option', os => os.map(o => o.textContent));
  t.ok(!opts.some(o => /T-RAB/.test(o)) && /T-DENT/.test(opts[1]) && /dental booked/.test(opts[1]), 'rabbits are left out and dental-booked animals come first: ' + opts.join(' | '));

  await page.selectOption('#animalPick', 'a2');
  t.ok(/T-DENT/.test(await page.textContent('#chartTitle')) && /Canine/.test(await page.textContent('#chartTitle')), 'the animal ID is filled in from the booking, as a canine chart');
  t.ok(await page.locator('.tooth').count() === 42, 'a canine chart has 42 teeth');
  await page.click('[data-grade="3"]');
  await page.fill('#desc', 'moderate gingivitis over the LU arcade');
  await page.selectOption('#procedure', 'spx');
  t.ok(/G3\/4 dental disease, moderate gingivitis over the LU arcade\./.test(await page.textContent('#sentence')), 'the sentence at the start of the chart: ' + await page.textContent('#sentence'));

  // 408: surgical extraction, furcation 2, pocket buccal 4 -> abbreviations on the tooth
  await page.click('.tooth[data-tooth="408"]');
  t.ok(/2 roots/.test(await page.textContent('#tpSub')) && /Mandibular right fourth premolar/.test(await page.textContent('#tpTitle')), 'the panel names the tooth and its roots');
  const labels = await page.$$eval('#tpChecks label', ls => ls.map(l => l.textContent.trim()));
  ['Missing tooth', 'Retained root', 'Attrition', 'Abrasion', 'Complicated crown fracture', 'Uncomplicated crown fracture', 'Oral mass', 'Oronasal fistula', 'Persistent deciduous'].forEach(l => t.ok(labels.includes(l), 'the vet picks the words: ' + l));
  await page.selectOption('[data-field="ext"]', 'surgical');
  await page.selectOption('[data-field="furcation"]', '2');
  await page.selectOption('[data-field="pocketB"]', '4');
  await page.selectOption('[data-field="pocketL"]', '3');
  const tk = (await page.innerText('.tooth[data-tooth="408"] .tk')).replace(/\s+/g, ' ');
  t.ok(tk === 'FE2 PP B4/L3 XS', 'the chart shows the abbreviations, not the words: ' + tk);
  t.ok(await page.locator('.tooth[data-tooth="408"] svg polygon').count() === 3, 'tooth 408 is drawn with its crown and 2 roots');
  t.ok(await page.locator('.tooth[data-tooth="108"] svg polygon').count() === 4, 'the upper carnassial is drawn with 3 roots');
  await page.click('.tooth[data-tooth="401"]'); await page.selectOption('[data-field="ext"]', 'nonsurgical');
  await page.click('.tooth[data-tooth="402"]'); await page.selectOption('[data-field="ext"]', 'nonsurgical');
  await page.click('.tooth[data-tooth="104"]'); await page.check('[data-check="ccf"]'); await page.selectOption('[data-field="mobility"]', '2');
  t.ok((await page.innerText('.tooth[data-tooth="104"] .tk')).replace(/\s+/g, ' ') === 'CCF M2', 'complicated crown fracture + mobile grade 2 -> CCF M2');
  t.ok(/Extractions: 408 surgical extraction; 401, 402 non-surgical extraction\./.test(await page.textContent('#extractNote')), 'the page shows what goes into the surgery note: ' + await page.textContent('#extractNote'));

  // one animal per PDF
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pdfBtn')]);
  t.ok(dl.suggestedFilename() === 'T-DENT_dental_chart.pdf', 'the PDF is named for the animal: ' + dl.suggestedFilename());
  const p = await dl.path(); const head = fs.readFileSync(p).slice(0, 5).toString();
  t.ok(head === '%PDF-' && fs.statSync(p).size > 3000, 'a real PDF file came down');

  // a cat chart
  await page.selectOption('#animalPick', 'a4');
  t.ok(await page.locator('.tooth').count() === 30 && /Feline/.test(await page.textContent('#chartTitle')), 'a feline chart has 30 teeth');
  t.ok(await page.locator('#savedList .saved').count() === 2, 'both charts are listed on this device');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#savedList .saved[data-key="a2"] [data-act="pdf"]')]);
  t.ok(dl2.suggestedFilename() === 'T-DENT_dental_chart.pdf', 'each saved chart has its own PDF button');

  // the Surgery tool fills the note by itself
  const sp = await ctx.newPage();
  sp.on('pageerror', e => errors.push('surgery: ' + e.message)); sp.on('dialog', d => d.accept());
  await sp.goto('file://' + path.resolve(__dirname, '../surgery.html'));
  await sp.waitForTimeout(600);
  await sp.evaluate(() => openExam('a2'));
  const sn = await sp.inputValue('#fld_surgNotes');
  t.ok(/Refer to dental chart\. G3\/4 dental disease, moderate gingivitis over the LU arcade\. Scale and polish with extractions\.\nExtractions: 408 surgical extraction; 401, 402 non-surgical extraction\./.test(sn), 'the surgery note carries the extractions and the type: ' + sn.split('\n').filter(l => /dental chart|Extractions/.test(l)).join(' / '));
  t.ok(!/\(Surgical \/ Closed \/ No\) extractions performed/.test(sn), 'the blank extractions line is replaced');
  t.ok(await sp.locator('a[href^="dental.html?animal=a2"]').count() === 1, 'the exam links back to the chart');
  const full = await sp.evaluate(() => assembleNote(state.animals.find(x => x.id === 'a2')));
  t.ok(/408 surgical extraction; 401, 402 non-surgical extraction/.test(full), 'and so does the exported note');
  // change the chart; the note follows
  await page.click('.tooth[data-tooth="408"]'); await page.selectOption('#procedure', 'spx'); await page.selectOption('[data-field="ext"]', '');
  await page.selectOption('#animalPick', 'a2'); await page.click('.tooth[data-tooth="408"]'); await page.selectOption('[data-field="ext"]', '');
  await sp.evaluate(() => openExam('a2'));
  const sn2 = await sp.inputValue('#fld_surgNotes');
  t.ok(/Extractions: 401, 402 non-surgical extraction\./.test(sn2) && !/408 surgical/.test(sn2) && (sn2.match(/Refer to dental chart\./g) || []).length === 1, 'editing the chart updates the same lines, no duplicates');
  // an animal without a chart is untouched
  await sp.evaluate(() => openExam('a1'));
  t.ok(!/Refer to dental chart/.test(await sp.inputValue('#fld_surgNotes')), 'an animal with no dental chart is untouched');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
