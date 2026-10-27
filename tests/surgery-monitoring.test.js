// Surgery: monitoring readings are never lost. Typed readings are saved as typed, and when two stations change the same
// list of readings or medications (shared shift) both sides' rows are kept. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-monitoring');
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ'); localStorage.setItem('__seeded', '1'); } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '..', 'surgery.html')); await page.waitForTimeout(500);
  await page.evaluate(() => { const m = document.getElementById('startShiftModal'); if (m) m.remove(); });
  await page.evaluate(() => {
    const a = normalizeAnimal({ id: 'fict1', animalId: 'FICT-1', species: 'dog', weight: '20' });
    a.vitals.push({ id: 'v1', time: '10:00', hr: '', rr: '', spo2: '>98%', spo2Mode: 'default', iso: '1', o2: '4' });
    a.postopVitals.push({ id: 'p1', time: '11:00', hr: '', temp: '', mm: 'Pink', crt: '<2s', mentation: 'Recumbent', mentationOther: '' });
    state.animals.push(a); saveShift(); renderShiftList(); openExam('fict1');
  });
  const stored = (list, key) => page.evaluate(([list, key]) => { const l = JSON.parse(localStorage.getItem('ldh_surgery_shift_v1') || '[]'); const a = l.find(x => x.id === 'fict1'); return a && a[list][0] ? a[list][0][key] : null; }, [list, key]);
  // typed readings are saved without leaving the box
  await page.locator('[data-vfield="hr"]').first().click(); await page.keyboard.type('128');
  await page.locator('[data-vfield="bp"]').first().click(); await page.keyboard.type('110');
  await page.waitForTimeout(1300);
  t.ok((await stored('vitals', 'hr')) === '128' && (await stored('vitals', 'bp')) === '110', 'an intra-op reading typed into a box is saved by itself (HR 128, BP 110), without clicking away');
  await page.locator('[data-pvfield="temp"]').first().click(); await page.keyboard.type('37.8');
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  t.ok((await stored('postopVitals', 'temp')) === '37.8', 'a post-op reading is saved the moment the page is hidden');
  // merging monitoring rows from two stations
  const merged = await page.evaluate(() => {
    const row = (id, hr) => ({ id, time: '10:0' + id.slice(1), hr });
    const base = [row('v1', '100')];
    const here = [row('v1', '100'), row('v2', '120')];                       // added v2 here, not synced yet
    const there = [row('v1', '100'), row('v3', '130')];                      // added v3 on the other station
    const bothAdded = shareMergeRows(base, here, there).map(r => r.id).join();
    const removedHere = shareMergeRows([row('v1', '100'), row('v4', '90')], [row('v1', '100')], [row('v1', '100'), row('v4', '90')]).map(r => r.id).join();   // we removed v4, they did not touch it
    const removedThere = shareMergeRows([row('v1', '100'), row('v5', '80')], [row('v1', '100'), row('v5', '80')], [row('v1', '100')]).map(r => r.id).join();    // they removed v5
    const changedHere = shareMergeRows([row('v1', '100')], [row('v1', '111')], [row('v1', '100')])[0].hr;                  // we edited, they did not
    const changedThere = shareMergeRows([row('v1', '100')], [row('v1', '100')], [row('v1', '222')])[0].hr;                 // they edited, we did not
    const noBase = shareMergeRows(null, [row('v2', '1')], [row('v3', '2')]).map(r => r.id).join();
    return { bothAdded, removedHere, removedThere, changedHere, changedThere, noBase };
  });
  t.ok(merged.bothAdded === 'v1,v3,v2', 'a reading added on each station: both are kept (' + merged.bothAdded + ')');
  t.ok(merged.removedHere === 'v1' && merged.removedThere === 'v1', 'a row removed on one station stays removed');
  t.ok(merged.changedHere === '111' && merged.changedThere === '222', 'an edit made here is kept; an edit made there is taken when nothing changed here');
  t.ok(merged.noBase === 'v3,v2', 'with no earlier sync nothing is dropped (' + merged.noBase + ')');
  // end to end through sharePull: a cloud copy with another station's reading must not erase one added here
  const out = await page.evaluate(async () => {
    const a = state.animals.find(x => x.id === 'fict1');
    const remoteBase = stripForSync(a); share.base[a.id] = JSON.parse(JSON.stringify(remoteBase));   // what both stations last agreed on
    a.vitals.push({ id: 'vHere', time: '10:05', hr: '140', rr: '', spo2: '>98%', spo2Mode: 'default', iso: '1', o2: '4' });   // added here, not pushed yet
    const remote = JSON.parse(JSON.stringify(remoteBase)); remote.vitals.push({ id: 'vThere', time: '10:06', hr: '150', rr: '', spo2: '>98%', spo2Mode: 'default', iso: '1', o2: '4' });   // added on another station
    share.on = true; share.sessionDate = shareDate(); share.client = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [{ id: a.id, data: remote }], error: null }) }) }) };
    await sharePull(); share.on = false;
    return a.vitals.map(v => v.id).join();
  });
  t.ok(/vHere/.test(out) && /vThere/.test(out) && /v1/.test(out), 'a pull from the cloud keeps the reading added here and brings in the other station\'s: ' + out);
  t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  await browser.close(); t.done();
})();
