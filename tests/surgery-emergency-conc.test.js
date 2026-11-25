// Emergency sheet: stock strengths from the emergency box are pre-filled, and can still be typed over. Fictional animal only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-emergency-conc');
const FILE = 'file://' + path.resolve(__dirname, '..', 'surgery.html');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  try {
    await page.goto(FILE); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const a = normalizeAnimal({ id: 'fict1', animalId: 'FICT-1', species: 'cat', weight: '4', surgType: 'spey' });
      state.animals.push(a); state.openId = a.id;
      const out = {};
      openEmergency();
      const read = (scn, k) => { selectScenario(a, scn); return [document.querySelector(`[data-emgconc="${k}"]`).value, document.querySelector(`#emg-panel .emg-ml[data-k="${k}"]`).textContent]; };
      out.atr = read('arrest', 'arr_atr'); out.nal = read('arrest', 'arr_nal'); out.nal2 = read('apnoea', 'apn_nal');
      out.batr = read('brady', 'bra_atr'); out.gly = read('brady', 'bra_gly'); out.lid = read('tachy', 'tac_lid');
      out.adr = read('arrest', 'arr_adr');
      setEmgConc(a, 'arr_atr', '0.5'); out.typed = read('arrest', 'arr_atr');
      setEmgConc(a, 'arr_atr', ''); out.cleared = read('arrest', 'arr_atr');
      selectScenario(a, 'apnoea'); logEmgDrug(a, 'apn_nal'); out.log = a.emergency[0].text;
      return out;
    });
    const is = (name, got, want) => t.ok(JSON.stringify(got) === JSON.stringify(want), name + ' ' + JSON.stringify(got));
    is('atropine 0.6', r.atr, ['0.6', '0.333 mL']);
    is('naloxone 0.4 (arrest)', r.nal, ['0.4', '0.4 mL']);
    is('naloxone 0.4 (apnoea)', r.nal2, ['0.4', '0.4 mL']);
    is('atropine 0.6 (bradycardia)', r.batr, ['0.6', '0.133–0.267 mL']);
    is('glycopyrrolate 0.2', r.gly, ['0.2', '0.1–0.22 mL']);
    is('lignocaine 20', r.lid, ['20', '0.05–0.1 mL']);
    is('adrenaline left blank (no label supplied)', r.adr, ['', '— mL']);
    is('typed value wins', r.typed, ['0.5', '0.4 mL']);
    is('emptied box stays empty', r.cleared, ['', '— mL']);
    t.ok(r.log.includes('(0.4 mL)'), 'log records the mL: ' + r.log);
    t.ok(!errs.length, 'no page errors ' + errs.join(' | '));
  } finally { await browser.close(); }
  t.done();
})();
