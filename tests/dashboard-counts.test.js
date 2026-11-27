// 2026-11-27 counts: surgery sends only the ID/tag (extra notes in the box made one animal count twice); each neo is counted in Processing.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('dashboard-counts');
(async () => {
  const browser = await chromium.launch();
  const sent = [];
  const make = async () => {
    const ctx = await browser.newContext();
    await ctx.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try { sent.push(JSON.parse(route.request().postData() || '{}')); } catch (e) {}
      route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ ok: true, done: [] }) });
    });
    await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 't'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    return { page, errs };
  };
  try {
    const s = await make(); await s.page.goto('file://' + path.resolve(__dirname, '../surgery.html')); await s.page.waitForTimeout(500);
    await s.page.evaluate(() => {
      const list = [{ animalId: '1175342', location: '' }, { animalId: 'CZU635', location: 'P2-27' }];
      syncListToDashboard(list, 'surgery');
      syncCompletionToDashboard({ animalId: '1175342 vc2', location: '' }, 'surgery');
      syncCompletionToDashboard({ animalId: 'czu635 has IP', location: 'P2-27' }, 'surgery');
      removeFromDashboard({ animalId: '1175285 VC1', location: 'VC2' }, 'surgery');
    });
    await s.page.waitForTimeout(800);
    const titles = sent.flatMap(b => b.items ? b.items.map(i => i.title) : b.delete ? ['del ' + b.delete.title] : b.title ? ['done ' + b.title] : []);
    t.ok(JSON.stringify(titles) === JSON.stringify(['1175342', 'CZU635', 'done 1175342', 'done CZU635', 'del 1175285']), 'surgery sends only the number or tag: ' + titles.join(' | '));
    sent.length = 0;
    const p = await make(); await p.page.goto('file://' + path.resolve(__dirname, '../processing.html')); await p.page.waitForTimeout(500);
    await p.page.evaluate(() => {
      const a = makeAnimal({ animalId: '1178107', location: 'Cat transport', species: 'cat' }); a.id = 'q'; a.checklist = 'queen'; a.nextStep = 'Awaiting sort';
      a.kc.neos = [{ id: '1178108' }, { id: '1178109' }, { id: '' }]; state.animals = [a]; saveShift(); renderShiftList(); openExam('q');
    });
    const done = () => sent.filter(b => b.title && !b.items).map(b => b.title).sort();
    await p.page.click('#markDoneBtn'); await p.page.waitForTimeout(1200);
    t.ok(JSON.stringify(done()) === JSON.stringify(['1178107', '1178108', '1178109']), 'registering a queen counts her and each numbered neo: ' + done().join());
    await p.page.evaluate(() => dashCatchUp()); await p.page.waitForTimeout(600);
    t.ok(done().filter(x => x === '1178108').length === 1, 'neos are not sent twice');
    await p.page.click('#markDoneBtn'); await p.page.evaluate(() => dashCatchUp()); await p.page.waitForTimeout(800);
    t.ok(['1178108', '1178109'].every(id => sent.some(b => b.delete && b.delete.title === id)), 'un-registering takes the neos back off');
    // duplicating for littermates must never delete the original from the dashboard
    sent.length = 0;
    const d = await make(); await d.page.goto('file://' + path.resolve(__dirname, '../processing.html')); await d.page.waitForTimeout(500);
    d.page.removeAllListeners('dialog'); d.page.on('dialog', x => x.type() === 'prompt' ? x.accept('2') : x.accept());
    await d.page.evaluate(() => { const a = makeAnimal({ animalId: '1178107', location: 'Cat transport', species: 'cat' }); a.id = 'o'; state.animals = [a]; saveShift(); renderShiftList(); openExam('o'); });
    await d.page.click('#markDoneBtn'); await d.page.waitForTimeout(800);
    await d.page.click('#duplicateBtn'); await d.page.waitForTimeout(300);
    let n = 8;
    for (const id of await d.page.evaluate(() => state.animals.filter(a => a.id !== 'o').map(a => a.id))) {
      await d.page.evaluate(id => openExam(id), id); await d.page.fill('#fld_animalid', '117810' + (n++)); await d.page.evaluate(() => document.activeElement.blur()); await d.page.waitForTimeout(600); await d.page.click('#markDoneBtn'); await d.page.waitForTimeout(700);
    }
    t.ok(!sent.some(b => b.delete) && ['1178107', '1178108', '1178109'].every(id => done().includes(id)), 'original and both littermates stay counted, nothing deleted: ' + done().join() + (sent.some(b => b.delete) ? ' DELETED' : ''));
    // today's list sends its registered animals once more, putting back any that were lost
    sent.length = 0;
    await d.page.evaluate(() => { localStorage.removeItem('ldh_dash_resend_v1'); localStorage.setItem('ldh_surgery_x', ''); dashCatchUp(); }); await d.page.waitForTimeout(900);
    t.ok(done().filter(x => /11781(07|08|09)/.test(x)).length >= 3, 'registered animals are re-sent once: ' + done().join());
    sent.length = 0; await d.page.evaluate(() => dashCatchUp()); await d.page.waitForTimeout(600);
    t.ok(!done().length, 'and only once');
    t.ok(!d.errs.length, 'no page errors: ' + d.errs.join('; '));
    t.ok(!s.errs.length && !p.errs.length, 'no page errors: ' + s.errs.concat(p.errs).join('; '));
  } finally { await browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 400)); process.exit(1); });
