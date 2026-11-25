// Surgery + Dental chart on shared stations (2026-11-25): the background sync was redrawing the exam over and over, which reloads
// the embedded chart, so the tooth being charted closed and values could not be put in. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('surgery-dental-sync');
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
// the real column is jsonb, which hands object keys back sorted (shortest first), not in the order they were written
const jsonbOrder = v => Array.isArray(v) ? v.map(jsonbOrder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort((x, y) => x.length - y.length || (x < y ? -1 : 1)).map(k => [k, jsonbOrder(v[k])])) : v;
(async () => {
  const cloud = new Map();   // id -> { id, shift_date, data }
  // same rule as jsonb_deep_merge in the database: objects merge key by key, anything else (null too) is stored as given
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const deepMerge = (target, patch) => { Object.keys(patch).forEach(k => { const v = patch[k]; if (isObj(v) && isObj(target[k])) deepMerge(target[k], v); else target[k] = JSON.parse(JSON.stringify(v)); }); return target; };
  const handler = async (op, a) => {
    if (op === 'rpc') { const row = cloud.get(a.p_id) || { id: a.p_id, shift_date: a.p_shift_date, data: {} }; deepMerge(row.data, a.p_patch || {}); cloud.set(a.p_id, row); return { data: null, error: null }; }
    if (op === 'from') {
      if (a.op === 'select') return { data: [...cloud.values()].filter(r => Object.keys(a.f).every(k => r[k] === a.f[k])).map(r => jsonbOrder(r)), error: null };
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
  const exams = s => s.page.evaluate(() => window.__exams);
  const frame = s => s.page.frameLocator('#dentalFrame');
  try {
    await A.page.evaluate(async () => { await shareStart('a@b.c', 'x'); });
    await B.page.evaluate(async () => { await shareStart('a@b.c', 'x'); });
    await A.page.evaluate(() => {
      const a = normalizeAnimal({ id: 'fict1', animalId: 'FICT-1', species: 'cat', weight: '4', surgType: 'dental' });
      a.vitals.push({ id: 'iv1', time: '09:30', hr: '110', rr: '20', spo2: '>98%', spo2Mode: 'default', iso: '1.5', o2: '1' });
      state.animals.push(a); saveShift(); renderShiftList();
    });
    await sync(A); await sync(B);
    await A.page.evaluate(() => { openExam('fict1'); window.__exams = 0; const real = openExam; openExam = function (id) { window.__exams++; return real(id); }; });
    await frame(A).locator('[data-tooth="104"]').waitFor();
    // 1. nothing changes anywhere: the screen must not be redrawn by the background sync
    for (let i = 0; i < 4; i++) await sync(A);
    t.ok((await exams(A)) === 0, 'no redraw while nothing has changed (redraws: ' + (await exams(A)) + ')');
    // 1b. a tick is made and then taken off again (the database keeps the removed key as null): still no endless redraw
    await A.page.evaluate(() => { const a = state.animals[0]; a.ticks.scratch = { done: true, time: '09:40' }; saveShift(); });
    await sync(A); await sync(B);
    await A.page.evaluate(() => { delete state.animals[0].ticks.scratch; saveShift(); });
    await sync(A); await sync(B); await sync(A);
    await A.page.evaluate(() => { window.__exams = 0; });
    for (let i = 0; i < 4; i++) { await sync(A); await sync(B); }
    t.ok((await exams(A)) === 0, 'no redraw after something was un-ticked (redraws: ' + (await exams(A)) + ')');
    t.ok(!(await get(B, 'ticks.scratch')), 'and the other station sees it un-ticked');
    // 2. the nurse is part-way through a tooth when a reading arrives from the other station
    await frame(A).locator('[data-tooth="104"]').click();
    await frame(A).locator('[data-field="pocketB"]').selectOption('3');
    await B.page.evaluate(() => { const a = state.animals.find(x => x.id === 'fict1'); a.vitals.push({ id: 'iv2', time: '09:35', hr: '108', rr: '18', spo2: '>98%', spo2Mode: 'default', iso: '1.5', o2: '1' }); saveShift(); });
    await sync(B); await sync(A); await A.page.waitForTimeout(800);
    t.ok(await frame(A).locator('#toothPanel').isVisible(), 'the open tooth stays open when the other station adds a reading');
    await frame(A).locator('[data-field="gingivitis"]').selectOption('3', { timeout: 3000 }).catch(() => {});
    const tooth = await A.page.evaluate(() => (JSON.parse(localStorage.getItem('ldh_dental_charts_v1') || '{}').fict1 || { teeth: {} }).teeth['104']);
    t.ok(tooth && tooth.pocketB === '3' && tooth.gingivitis === '3', 'and she can carry on entering values: ' + JSON.stringify(tooth && { pocketB: tooth.pocketB, gingivitis: tooth.gingivitis }));
    // 3. once she taps outside the chart the waiting reading is shown, the same tooth is still open and the page does not jump
    const height = () => A.page.$eval('#dentalFrame', f => Math.round(f.getBoundingClientRect().height));
    await A.page.waitForTimeout(900); const before = await height();
    await A.page.evaluate(() => { window.__exams = 0; document.activeElement.blur(); });
    await sync(A);
    t.ok((await exams(A)) === 1 && (await A.page.locator('#examBody').innerHTML()).includes('09:35'), 'the screen catches up with the other station once she leaves the chart (redraws: ' + (await exams(A)) + ')');
    t.ok(Math.abs((await height()) - before) <= 4, 'the chart keeps its height while it reloads: ' + before + 'px then ' + (await height()) + 'px');
    await frame(A).locator('#toothPanel').waitFor({ timeout: 5000 }).catch(() => {});
    const title = await frame(A).locator('#tpTitle').textContent({ timeout: 3000 }).catch(() => '');
    t.ok(/Tooth 104/.test(title), 'and the tooth she was on is open again: ' + title);
    for (let i = 0; i < 4; i++) { await sync(A); await sync(B); }
    t.ok(A.errs.length === 0 && B.errs.length === 0, 'no page errors: ' + A.errs.concat(B.errs).join('; '));
  } finally { await browser.close(); }
  t.done();
})();
