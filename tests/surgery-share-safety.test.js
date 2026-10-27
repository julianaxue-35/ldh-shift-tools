// Surgery: one active tab, shared-record guards, and the day rule. Fictional animals only; nothing leaves the machine.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-share-safety');
const FILE = 'file://' + path.resolve(__dirname, '..', 'surgery.html');
const seedInit = () => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('ldh_processing_vetinit_v1', 'JX'); localStorage.setItem('__seeded', '1'); } };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(seedInit);
  const errs = [];
  const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(FILE); await p.waitForTimeout(500); return p; };
  const blocked = p => p.locator('#tabBlock').count().then(n => n > 0);

  // ---- one active tab ----
  const a = await open();
  t.ok(!(await blocked(a)), 'the first tab opens normally');
  await a.evaluate(() => { state.animals.push(normalizeAnimal({ id: 'x1', animalId: 'FICT-1', species: 'cat', weight: '4' })); saveShift(); });
  const b = await open();
  t.ok(await blocked(b), 'a second tab is blocked with a message');
  t.ok(/only \S*one\S* Surgery tab|only one/i.test(await b.textContent('#tabBlock')), 'the message explains one tab at a time');
  t.ok((await b.evaluate(() => persistShift())) === false, 'a blocked tab never writes the list');
  await b.evaluate(() => { try { state.animals.length = 0; } catch (e) {} });
  const stored = await a.evaluate(() => JSON.parse(localStorage.getItem('ldh_surgery_shift_v1') || '[]').map(x => x.animalId));
  t.ok(stored.join() === 'FICT-1', 'the list in storage is untouched by the blocked tab: ' + stored);
  // hand over
  await b.click('#tabTakeBtn'); await b.waitForTimeout(800);
  t.ok(!(await blocked(b)), 'after "Use this tab instead" the second tab works');
  t.ok((await b.evaluate(() => state.animals.map(x => x.animalId).join())) === 'FICT-1', 'and it started from the saved list (nothing lost)');
  await a.waitForTimeout(600);
  t.ok(await blocked(a), 'the first tab now pauses itself');
  t.ok((await a.evaluate(() => persistShift())) === false, 'and the paused tab cannot write either');
  await a.close(); await b.close();

  // ---- shared-record guard ----
  const g = await open();
  const guard = await g.evaluate(() => {
    const base = { animalId: 'FICT-9', location: 'Cat Room 1', species: 'cat', ticks: { a: 1 }, note: 'x', weight: '4' };
    return { noId: shareLooksPartial({ ticks: { b: 1 } }, base), fewKeys: shareLooksPartial({ animalId: 'FICT-9' }, base), full: shareLooksPartial(Object.assign({}, base, { weight: '5' }), base),
      newBlankId: shareLooksPartial({ animalId: '', location: 'Cat Room 1' }, null) };
  });
  t.ok(guard.noId && guard.fewKeys, 'a fragment with no animal ID (or far fewer fields than we hold) is treated as incomplete and skipped');
  t.ok(!guard.full && !guard.newBlankId, 'a complete record, and a brand-new animal with a blank ID, are still accepted');

  // ---- day rule ----
  g.removeAllListeners('dialog'); g.on('dialog', d => d.dismiss());   // "keep it for now" on the old-list prompt
  await g.evaluate(() => {
    localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([{ id: 'o1', animalId: 'FICT-OLD', registered: false }, { id: 'n1', animalId: 'FICT-NEW', registered: false, addedDay: shareDate() }]));
    localStorage.setItem('ldh_surgery_shift_v1_date', '26 Oct 2026');
    localStorage.setItem('ldh_surgery_share_on_v1', '2026-10-26');
  });
  await g.reload(); await g.waitForTimeout(600);
  const day = await g.evaluate(() => ({ old: state.animals.find(x => x.id === 'o1').addedDay, nw: state.animals.find(x => x.id === 'n1').addedDay === shareDate(), on: localStorage.getItem('ldh_surgery_share_on_v1'),
    note: (document.getElementById('shareDayNote') || {}).textContent || '', noteShown: !document.getElementById('shareDayNote').classList.contains('hidden'), eligible: [shareEligible({ addedDay: '2026-10-26' }), shareEligible({ addedDay: shareDate() })] }));
  t.ok(day.old === '2026-10-26', 'an animal saved before the stamp takes its list\'s start day: ' + day.old);
  t.ok(day.on === null && day.noteShown && /new day/i.test(day.note), 'sharing left on from yesterday is switched off for the new day, with a note');
  t.ok(/From 26 Oct/.test(await g.textContent('#animalList')), 'the older animal stays on the list, tagged "From 26 Oct"');
  const fresh = await g.evaluate(() => { share.sessionDate = shareDate(); return [shareEligible({ addedDay: '2026-10-26' }), shareEligible({ addedDay: shareDate() })]; });
  t.ok(fresh[0] === false && fresh[1] === true, 'only today\'s animals are eligible to be shared: ' + fresh);

  // ---- undo a registration after an export: the animal shares again ----
  await g.close(); await new Promise(r => setTimeout(r, 300));
  const u = await open();
  await u.evaluate(() => {
    const a = normalizeAnimal({ id: 'u1', animalId: 'FICT-U', species: 'cat', weight: '4', registered: true, cloudScrubbed: true }); a.addedDay = shareDate();
    state.animals.push(a); saveShift(); share.scrubbed.add('u1'); share.base['u1'] = { animalId: 'FICT-U' }; openExam('u1');
  });
  await u.evaluate(() => document.getElementById('markDoneBtn').click()); await u.waitForTimeout(300);
  const re = await u.evaluate(() => { const a = state.animals.find(x => x.id === 'u1'); return { reg: a.registered, scrubbed: !!a.cloudScrubbed, marked: share.scrubbed.has('u1'), base: 'u1' in share.base }; });
  t.ok(re.reg === false && re.scrubbed === false && re.marked === false && re.base === false, 'undoing a registration clears the "exported" mark and the last-synced copy, so the whole animal is sent again: ' + JSON.stringify(re));
  t.ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  await browser.close(); t.done();
})();
