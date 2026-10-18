// "Entered in ShelterMate" read-back, end-of-shift check, and start-of-shift initials (Processing + Sick & Injured).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const t = require('./check')('entered-aa');
const TODAY = new Date().toLocaleDateString('en-CA');
const TOOLS = [
  { file: 'processing.html', key: 'processing', kind: 'processing_note', src: 'processing', shiftKey: 'ldh_processing_shift_v1' },
  { file: 'sick-injured.html', key: 'sick_injured', kind: 'si_note', src: 'sick-injured', shiftKey: null }
];
const sigOf = (txt) => txt; // placeholder: the page recomputes signatures itself

async function start(tool, { animals, pending = [], online = true, initialsDay = TODAY, shared = true, charts = [] } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const asks = [];
  let up = online, waiting = pending;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (!up) return route.abort();
    if (body.aa_check) { asks.push(body.aa_check.items); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, pending: waiting }) }); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body.aa ? { ok: true } : {}) });
  });
  await ctx.addInitScript((o) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    if (localStorage.getItem('ldh_processing_vetinit_v1') === null) {   // seed once, so a reload keeps what the page saved
      localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ');
      if (o.initialsDay) localStorage.setItem('ldh_processing_vetinit_v1_day', o.initialsDay);
    }
    if (o.shiftKey) { localStorage.setItem(o.shiftKey, JSON.stringify(o.animals)); localStorage.setItem(o.shiftKey + '_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })); }
    if (o.shared) localStorage.setItem('ldh_aa_share_' + o.key, '1');
    if (o.charts.length) localStorage.setItem('ldh_medcharts_v1', JSON.stringify(o.charts));
  }, { animals, initialsDay, shiftKey: tool.shiftKey, key: tool.key, shared, charts });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto('file://' + path.resolve(__dirname, '..', tool.file));
  await page.waitForTimeout(500);
  if (!tool.shiftKey) await page.evaluate((as) => { state.animals.length = 0; as.forEach(a => state.animals.push(a)); saveShift(); renderShiftList(); renderAaShare(); }, animals);
  if (!tool.shiftKey && shared) await page.evaluate((k) => { AAShare.setOn(k, true); renderAaShare(); }, tool.key);
  return { browser, page, errors, dialogs, asks, setOnline: v => { up = v; }, setPending: v => { waiting = v; } };
}

(async () => {
  for (const tool of TOOLS) {
    const L = tool.key + ': ';
    const base = (id, extra) => Object.assign({ id, animalId: id, location: 'Pound 1', species: 'dog', registered: true, noteEdited: 'Note ' + id, weight: '10' }, extra || {});
    const animals = [base('E-1'), base('E-2'), base('E-3'), base('E-4', { registered: false }), base('E-5')];
    let s = await start(tool, { animals, pending: [tool.kind + '|E-2'] });
    try {
      // stamp E-1, E-2 as sent (signature matches their note), E-3 never sent, E-5 sent
      await s.page.evaluate(() => { state.animals.forEach(a => { if (['E-1', 'E-2', 'E-5'].includes(a.animalId)) { a.aaSentAt = new Date().toISOString(); a.aaSig = AAShare.sig(aaSigText(a)); a.aaSentId = a.animalId; } }); saveShift(); });
      await s.page.click('#aaCheckBtn');
      await s.page.waitForFunction(() => state.animals.find(a => a.animalId === 'E-1').aaEnteredAt);
      const got = await s.page.evaluate(() => Object.fromEntries(state.animals.map(a => [a.animalId, a.aaEnteredAt || ''])));
      t.ok(got['E-1'] && got['E-5'] && !got['E-2'] && !got['E-3'], L + 'cards no longer waiting are entered; waiting and never-sent ones are not: ' + JSON.stringify(got));
      t.ok(s.asks[0].every(i => i.kind === tool.kind) && s.asks[0].map(i => i.animal_id).sort().join() === 'E-1,E-2,E-5', L + 'only animals that were sent are asked about: ' + JSON.stringify(s.asks[0]));
      const text = await s.page.textContent('#shiftListCard, #shiftList, body');
      const badges = await s.page.$$eval('.aa-badge', els => els.map(e => e.closest('.animal-card').textContent.replace(/\s+/g, ' ') + ' => ' + e.textContent));
      t.ok(badges.some(b => /E-1/.test(b) && /Entered in ShelterMate/.test(b)) && badges.some(b => /E-2/.test(b) && /Sent to AA/.test(b)) && badges.some(b => /E-3/.test(b) && /NOT SENT/.test(b)), L + 'each animal shows where it has got to: ' + badges.join(' | ').slice(0, 300));
      t.ok(/2 entered in ShelterMate/.test(await s.page.textContent('#aaShareSummary')), L + 'summary counts the entered: ' + await s.page.textContent('#aaShareSummary'));

      // offline / failure changes nothing
      s.setOnline(false);
      s.setPending([tool.kind + '|E-1']);
      s.dialogs.length = 0;
      await s.page.click('#aaCheckBtn');
      await s.page.waitForTimeout(500);
      t.ok((await s.page.evaluate(() => state.animals.find(a => a.animalId === 'E-1').aaEnteredAt)), L + 'a failed check leaves "entered" untouched');
      t.ok(s.dialogs.some(d => /reach the dashboard/i.test(d)), L + 'and says it could not check');
      s.setOnline(true);
      // the card reappears (edited after the AA ticked it) -> waiting again
      await s.page.click('#aaCheckBtn');
      await s.page.waitForFunction(() => !state.animals.find(a => a.animalId === 'E-1').aaEnteredAt);
      t.ok(true, L + 'a card that reappears goes back to "sent, waiting"');

      // end-of-shift check
      await s.page.click('#aaEndCheckBtn');
      await s.page.waitForSelector('#aaEndModal');
      const modal = await s.page.textContent('#aaEndModal');
      t.ok(/E-4/.test(modal) && /Not registered yet/i.test(modal), L + 'end-of-shift lists animals not yet registered');
      t.ok(/E-3/.test(modal) && /NOT SENT/.test(modal), L + 'end-of-shift lists animals not sent');
      t.ok(/E-5/.test(modal) && /Entered in ShelterMate/.test(modal) && /E-1/.test(modal) && /waiting/i.test(modal), L + 'end-of-shift shows entered vs waiting');
      t.ok(/need(s)? attention/i.test(modal), L + 'end-of-shift says how many need attention');
      await s.page.click('#aaEndClose');
      t.ok(s.errors.length === 0, L + 'no page errors: ' + s.errors.join('|'));
    } finally { await s.browser.close(); }

    // charts: entered shows up too
    const chart = { id: 'mc1', sourceAnimalId: 'E-1', sourceTool: tool.src, createdAt: new Date().toISOString(), animalId: 'E-1', species: 'dog', weight: '10', location: 'Pound 1', vetInCharge: 'jx', startOption: 'tomorrow',
      meds: [{ drugKey: 'x', drugName: 'X', route: 'PO', freq: 'SID', days: 3, startOption: 'tomorrow', labelEdited: true, labelText: 'X 1 tab SID' }] };
    s = await start(tool, { animals: [base('E-1')], pending: [], charts: [chart] });
    try {
      await s.page.evaluate(() => { state.animals.forEach(a => { a.aaSentAt = new Date().toISOString(); a.aaSig = AAShare.sig(aaSigText(a)); a.aaSentId = a.animalId; }); const c = MedChart.loadCharts()[0]; MedChart.saveCharts([Object.assign({}, c, { aaSentAt: new Date().toISOString(), aaSig: MedChart.aaChartSig(c) })]); });
      await s.page.click('#aaCheckBtn');
      await s.page.waitForFunction(() => MedChart.loadCharts()[0].aaEnteredAt);
      t.ok(s.asks[0].some(i => i.kind === 'med_chart' && i.animal_id === 'E-1'), L + 'sent medication charts are checked as well');
      await s.page.click('#aaEndCheckBtn');
      await s.page.waitForSelector('#aaEndModal');
      t.ok(/medication chart/i.test(await s.page.textContent('#aaEndModal')) && /Everything sent has been entered|all clear/i.test(await s.page.textContent('#aaEndModal')), L + 'end-of-shift shows the chart and an all-clear when nothing is outstanding');
    } finally { await s.browser.close(); }

    // sharing off: end-of-shift check says nothing is being shared
    s = await start(tool, { animals: [base('E-1')], shared: false });
    try {
      await s.page.click('#aaEndCheckBtn');
      await s.page.waitForSelector('#aaEndModal');
      t.ok(/sharing is off/i.test(await s.page.textContent('#aaEndModal')), L + 'with sharing off the check says so instead of calling everything NOT SENT');
    } finally { await s.browser.close(); }

    /* start-of-shift initials */
    s = await start(tool, { animals: [base('E-1')], initialsDay: '2020-01-01' });
    try {
      t.ok(await s.page.isVisible('#startShiftModal'), L + 'a new day asks for initials before anything else');
      t.ok((await s.page.inputValue('#vetInit')) === '', L + 'yesterday\'s vet initials are cleared');
      await s.page.click('#startShiftSave');
      t.ok(await s.page.isVisible('#startShiftModal'), L + 'the vet cannot carry on without initials');
      await s.page.fill('#startShiftVet', 'jx');
      await s.page.click('#startShiftSave');
      t.ok(!(await s.page.isVisible('#startShiftModal')) && (await s.page.inputValue('#vetInit')) === 'JX', L + 'initials are set from the prompt');
      await s.page.reload(); await s.page.waitForTimeout(400);
      t.ok(!(await s.page.isVisible('#startShiftModal')) && (await s.page.inputValue('#vetInit')) === 'JX', L + 'same day: no prompt and initials stay');
    } finally { await s.browser.close(); }
    s = await start(tool, { animals: [base('E-1')] });
    try { t.ok(!(await s.page.isVisible('#startShiftModal')) && (await s.page.inputValue('#vetInit')) === 'ZZ', L + 'initials entered today are kept'); } finally { await s.browser.close(); }
  }
  t.done();
})();
