// Surgery, two stations on one shared shift (a fake shared cloud stands in for the database). The real workflow: the surgery nurse
// finishes, the recovery nurse adds post-op vitals on another device, the surgery nurse goes back and edits surgery notes. Both
// stations must end up with both sets of changes, and nothing may be lost. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-two-stations');
const FILE = 'file://' + path.resolve(__dirname, '..', 'surgery.html');
const FAKE = () => {   // replaces the supabase library: every call goes to the shared store in the test runner
  const call = (op, args) => window.__cloud(op, JSON.parse(JSON.stringify(args || {})));
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'x' } } } }), signInWithPassword: async () => ({ error: null }), signOut: async () => ({}) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; }, removeChannel: () => {},
    rpc: (name, args) => call('rpc', Object.assign({ name }, args)).then(r => r),
    from: (table) => { const q = { _op: 'select', _f: {} };
      const api = { select: () => { q._op = 'select'; return api; }, delete: () => { q._op = 'delete'; return api; }, update: (v) => { q._op = 'update'; q._v = v; return api; },
        eq: (k, v) => { q._f[k] = v; return api; }, lt: () => api,
        then: (res, rej) => call('from', { op: q._op, f: q._f, v: q._v }).then(res, rej) };
      return api; }
  }) };
};
(async () => {
  const cloud = new Map();   // id -> { id, shift_date, data }
  const deepMerge = (target, patch) => { Object.keys(patch).forEach(k => { const v = patch[k]; if (v === null) delete target[k]; else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepMerge(target[k], v); else target[k] = JSON.parse(JSON.stringify(v)); }); return target; };
  const handler = async (op, a) => {
    if (op === 'rpc') { const row = cloud.get(a.p_id) || { id: a.p_id, shift_date: a.p_shift_date, data: {} }; deepMerge(row.data, a.p_patch || {}); cloud.set(a.p_id, row); return { data: null, error: null }; }
    if (op === 'from') {
      if (a.op === 'select') return { data: [...cloud.values()].filter(r => Object.keys(a.f).every(k => r[k] === a.f[k])).map(r => JSON.parse(JSON.stringify(r))), error: null };
      if (a.op === 'delete') { if (a.f.id) cloud.delete(a.f.id); return { error: null }; }
      if (a.op === 'update') { const r = cloud.get(a.f.id); if (r) r.data = a.v.data; return { error: null }; }
    }
    return { error: null };
  };
  const browser = await chromium.launch();
  const station = async (name) => {
    const ctx = await browser.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await ctx.exposeFunction('__cloud', handler);
    await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ'); });
    await ctx.addInitScript(FAKE);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(FILE); await page.waitForTimeout(500);
    await page.evaluate(() => { const m = document.getElementById('startShiftModal'); if (m) m.remove(); });
    return { name, ctx, page, errs };
  };
  const A = await station('surgery nurse'), B = await station('recovery nurse');
  const sync = async (s) => { await s.page.evaluate(async () => { await sharePush(); await sharePull(); }); };
  const get = (s, key) => s.page.evaluate((key) => { const a = state.animals.find(x => x.id === 'fict1'); return a ? (key.split('.').reduce((o, k) => o && o[k], a)) : undefined; }, key);
  try {
    await A.page.evaluate(async () => { await shareStart('a@b.c', 'x'); });
    await B.page.evaluate(async () => { await shareStart('a@b.c', 'x'); });
    // 1. the surgery nurse adds the animal and writes the surgery notes
    await A.page.evaluate(() => {
      const a = normalizeAnimal({ id: 'fict1', animalId: 'FICT-1', species: 'dog', weight: '20', surgType: 'castrate' });
      a.surgNotes = 'Routine castrate, uneventful.'; a.vitals.push({ id: 'iv1', time: '09:30', hr: '110', rr: '20', spo2: '>98%', spo2Mode: 'default', iso: '1.5', o2: '2' });
      state.animals.push(a); saveShift(); renderShiftList();
    });
    await sync(A); await sync(B);
    t.ok((await get(B, 'surgNotes')) === 'Routine castrate, uneventful.' && (await get(B, 'vitals.0.hr')) === '110', 'the recovery station receives the animal with its surgery notes and intra-op readings');
    // 2. recovery nurse adds post-op vitals; meanwhile the surgery nurse edits notes (without having pulled yet)
    await B.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.postopVitals.push({ id: 'pv1', time: '10:15', hr: '96', temp: '37.6', mm: 'Pink', crt: '<2s', mentation: 'Recumbent', mentationOther: '' }); saveShift(); });
    await A.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.surgComment = 'Skin closed with 3-0 monocryl, intradermal.'; a.surgNotes = 'Routine castrate, uneventful. Haemostasis good.'; saveShift(); });
    await sync(B); await sync(A); await sync(B); await sync(A);
    for (const s of [A, B]) {
      t.ok((await get(s, 'postopVitals.0.hr')) === '96' && (await get(s, 'postopVitals.0.temp')) === '37.6', s.name + ': has the recovery nurse\'s post-op vitals');
      t.ok((await get(s, 'surgComment')) === 'Skin closed with 3-0 monocryl, intradermal.' && (await get(s, 'surgNotes')) === 'Routine castrate, uneventful. Haemostasis good.', s.name + ': has the surgery nurse\'s edited notes');
      t.ok((await get(s, 'vitals.0.hr')) === '110', s.name + ': still has the intra-op reading');
    }
    t.ok(JSON.stringify(cloud.get('fict1').data.postopVitals.map(v => v.id)) === '["pv1"]' && cloud.get('fict1').data.surgComment, 'the shared copy holds both changes');
    // 3. both stations add readings to the same list at about the same time: both rows are kept
    await A.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.postopVitals.push({ id: 'pvA', time: '10:30', hr: '90', temp: '37.8', mm: 'Pink', crt: '<2s', mentation: 'Sternal', mentationOther: '' }); saveShift(); });
    await B.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.postopVitals.push({ id: 'pvB', time: '10:31', hr: '88', temp: '37.9', mm: 'Pink', crt: '<2s', mentation: 'Sternal', mentationOther: '' }); saveShift(); });
    await sync(A); await sync(B); await sync(A); await sync(B);
    for (const s of [A, B]) { const ids = await s.page.evaluate(() => state.animals.find(x => x.id === 'fict1').postopVitals.map(v => v.id).sort().join()); t.ok(ids === 'pv1,pvA,pvB', s.name + ': has all three post-op readings (' + ids + ')'); }
    // 4. a note typed on one station reaches the other (autosave -> push -> pull)
    await A.page.evaluate(() => { openExam('fict1'); });
    await A.page.locator('#fld_surgComment').click(); await A.page.keyboard.press('End'); await A.page.keyboard.type(' Recovered well.');
    for (let i = 0; i < 6; i++) { await A.page.waitForTimeout(1000); await sync(B); if (/Recovered well\./.test(await get(B, 'surgComment'))) break; }   // autosave + the 800 ms push, with room on a busy machine
    t.ok(/Recovered well\./.test(await get(B, 'surgComment')), 'a note typed on one station (no click-away) reaches the other station');
    // 5. a station is reloaded part-way through the shift (its list of last-synced copies is gone): nothing is lost either way
    await B.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.postopVitals.push({ id: 'pvOff', time: '11:00', hr: '84', temp: '38.0', mm: 'Pink', crt: '<2s', mentation: 'Standing', mentationOther: '' }); saveShift(); });
    await A.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.postopVitals.push({ id: 'pvA2', time: '11:01', hr: '82', temp: '38.1', mm: 'Pink', crt: '<2s', mentation: 'Standing', mentationOther: '' }); saveShift(); });
    await sync(A);                               // the reading A just added reaches the cloud while B has not pushed its own
    await B.page.reload(); await B.page.waitForTimeout(500);
    await B.page.evaluate(() => { const m = document.getElementById('startShiftModal'); if (m) m.remove(); });
    await B.page.evaluate(async () => { await shareStart('a@b.c', 'x'); await sharePush(); });
    await sync(A); await sync(B);
    for (const s of [A, B]) { const ids = await s.page.evaluate(() => state.animals.find(x => x.id === 'fict1').postopVitals.map(v => v.id).sort().join()); t.ok(ids === 'pv1,pvA,pvA2,pvB,pvOff', s.name + ': after a reload mid-shift both stations have every reading (' + ids + ')'); }
    t.ok(A.errs.length === 0 && B.errs.length === 0, 'no page errors: ' + A.errs.concat(B.errs).join('; '));
  } finally { await browser.close(); }
  t.done();
})();
