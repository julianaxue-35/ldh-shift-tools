// A medication wrapped across two lines at the source ("...to" + Enter + "(28.2mg/kg) 0.25mL PO BID.") is one line again.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('med-line-join');
(async () => {
  for (const file of ['sick-injured.html', 'processing.html']) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', file));
    await page.waitForTimeout(400);
    const R = s => page.evaluate(x => reflowMedText(x), s);
    t.ok(await R('Start gabapentin 200mg (90.9mg/kg) 0.25mL\n(20mg/kg) PO BID x 14 days') === 'Start gabapentin 200mg (90.9mg/kg) 0.25mL (20mg/kg) PO BID x 14 days', file + ': screenshot 1 is one line');
    t.ok(await R('gabapentin 200mg/mL (28.2mg/kg) to\n(28.2mg/kg) 0.25mL PO BID.') === 'gabapentin 200mg/mL (28.2mg/kg) to (28.2mg/kg) 0.25mL PO BID.', file + ': screenshot 2 is one line');
    t.ok(await R('Gabapentin 0.25mL\nPO BID\nfor 4 days') === 'Gabapentin 0.25mL PO BID for 4 days', file + ': dose / route+frequency / duration on separate lines join up');
    t.ok(await R('Gabapentin 0.25mL PO BID x 14 days\nMeloxicam 0.1mL PO SID x 3 days') === 'Gabapentin 0.25mL PO BID x 14 days\nMeloxicam 0.1mL PO SID x 3 days', file + ': two different medications stay on two lines');
    t.ok(await R('Gabapentin 0.25mL PO BID x 14 days\n\nMeloxicam 0.1mL SID') === 'Gabapentin 0.25mL PO BID x 14 days\n\nMeloxicam 0.1mL SID', file + ': a blank line still separates');
    t.ok(await R('gabapentin 0.25ml po bid\ngabapentin 0.25ml po bid') === 'gabapentin 0.25ml po bid', file + ': the same medication typed twice is still listed once');
    t.ok(await R('- Gabapentin 0.25mL\nPO BID\n- Meloxicam 0.1mL SID') === '- Gabapentin 0.25mL PO BID\n- Meloxicam 0.1mL SID', file + ': bulleted lists still work');
    t.ok(await R('') === '' && await R(null) === null, file + ': empty stays empty');
    if (file === 'sick-injured.html') {
      // saved text that was already broken is repaired the next time the list opens
      const fixed = await page.evaluate(() => { const a = normalizeAnimal({ id: 'q', animalId: 'M1', species: 'dog', currentMed: 'gabapentin 200mg/mL (28.2mg/kg) to\n(28.2mg/kg) 0.25mL PO BID.', treatment: 'Start gabapentin 200mg 0.25mL\n(20mg/kg) PO BID x 14 days' }); return [a.currentMed, a.treatment]; });
      t.ok(fixed[0] === 'gabapentin 200mg/mL (28.2mg/kg) to (28.2mg/kg) 0.25mL PO BID.' && fixed[1] === 'Start gabapentin 200mg 0.25mL (20mg/kg) PO BID x 14 days', file + ': animals already on the list are repaired when the page opens');
      // and the note
      const note = await page.evaluate(() => { const a = normalizeAnimal({ id: 'q2', animalId: 'M2', species: 'dog', weight: '10', currentMed: 'gabapentin 200mg/mL (28.2mg/kg) to\n(28.2mg/kg) 0.25mL PO BID.' }); return assembleNote(a); });
      t.ok(/Current medication: gabapentin 200mg\/mL \(28\.2mg\/kg\) to \(28\.2mg\/kg\) 0.25mL PO BID\./.test(note), file + ': the note shows it as one line');
    }
    t.ok(errors.length === 0, file + ': no page errors ' + errors.join('; '));
    await browser.close();
  }
  t.done();
})();
