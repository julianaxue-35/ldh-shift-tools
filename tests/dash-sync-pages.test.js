// Processing + Sick & Injured keep the dashboard in step: ID-only animals, edits, deletes and Clear list.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('dash-sync-pages');
const TOOLS = [
  { file: 'processing.html', shift: 'processing', shiftKey: 'ldh_processing_shift_v1', idField: 'fld_animalid', locField: 'fld_location', registerBtn: '#markDoneBtn' },
  { file: 'sick-injured.html', shift: 'sick_injured', shiftKey: 'ldh_sickinjured_shift_v1', idField: 'fld_animalId', locField: 'fld_location', registerBtn: '#markDoneBtn' }
];

async function start(tool, animals) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    posts.push(body);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[]}' });
  });
  await ctx.addInitScript((o) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
  }, { shiftKey: tool.shiftKey });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '..', tool.file));
  await page.waitForTimeout(500);
  // build the animals with the page's own constructor so every exam field exists
  await page.evaluate((rows) => {
    state.animals = rows.map(r => Object.assign(makeAnimal({ animalId: r.animalId, location: r.location, species: r.species, weight: r.weight, noteText: '', otherReminders: [] }), r));
    saveShift(); renderShiftList();
  }, animals);
  posts.length = 0;
  return { browser, page, posts, errors };
}
const base = (id, extra) => Object.assign({ id, animalId: '', location: '', species: 'dog', registered: false, noteEdited: 'n', weight: '10' }, extra || {});

(async () => {
  for (const tool of TOOLS) {
    const L = tool.shift + ': ';
    const s = await start(tool, [base('m1')]);
    try {
      /* 1. a manual add: just the ID, no location */
      await s.page.evaluate(() => openExam('m1'));
      await s.page.fill('#' + tool.idField, '9000001');
      await s.page.dispatchEvent('#' + tool.idField, 'change');
      await s.page.waitForTimeout(300);
      const added = s.posts.find(b => b.items);
      t.ok(added && added.items[0].title === '9000001' && added.items[0].location === 'Location TBC' && added.items[0].shift === tool.shift, L + 'an animal added by hand appears on the dashboard once it has an ID (placeholder location): ' + JSON.stringify(added));

      /* 2. register with only an ID: it counts as completed on the dashboard */
      s.posts.length = 0;
      await s.page.evaluate(() => openExam('m1'));
      await s.page.click(tool.registerBtn);
      await s.page.waitForTimeout(500);
      const comp = s.posts.find(b => b.title === '9000001');
      t.ok(comp && comp.location === 'Location TBC' && comp.shift === tool.shift, L + 'registering an ID-only animal sends it as completed: ' + JSON.stringify(comp));

      /* 3. adding the location afterwards moves the case */
      s.posts.length = 0;
      await s.page.evaluate(() => openExam('m1'));
      await s.page.fill('#' + tool.locField, 'Pound 4');
      await s.page.dispatchEvent('#' + tool.locField, 'change');
      await s.page.waitForTimeout(400);
      t.ok(s.posts.some(b => b.delete && b.delete.title === '9000001' && b.delete.location === 'Location TBC'), L + 'the placeholder case is removed when the location is entered');
      t.ok(s.posts.some(b => b.title === '9000001' && b.location === 'Pound 4'), L + 'and the animal is completed under its real location');

      /* 4. correcting the ID moves it too */
      s.posts.length = 0;
      await s.page.evaluate(() => openExam('m1'));
      await s.page.fill('#' + tool.idField, '9000002');
      await s.page.dispatchEvent('#' + tool.idField, 'change');
      await s.page.waitForTimeout(400);
      t.ok(s.posts.some(b => b.delete && b.delete.title === '9000001' && b.delete.location === 'Pound 4') && s.posts.some(b => b.title === '9000002' && b.location === 'Pound 4'), L + 'a corrected ID replaces the old case');

      /* 5. removing the animal removes whatever the dashboard holds */
      s.posts.length = 0;
      await s.page.evaluate(() => { const b = document.querySelector('[data-del="m1"]'); if (b) b.click(); else throw new Error('no remove button'); });
      await s.page.waitForTimeout(300);
      t.ok(s.posts.some(b => b.delete && b.delete.title === '9000002' && b.delete.location === 'Pound 4'), L + 'Remove deletes the case under the key last sent');
      t.ok(s.errors.length === 0, L + 'no page errors: ' + s.errors.join('|'));
    } finally { await s.browser.close(); }

    /* 6. Clear list: unfinished animals come off the dashboard, finished ones stay */
    const c = await start(tool, [
      base('u1', { animalId: '9100001', location: 'Pound 1', dashTitle: '9100001', dashLoc: 'Pound 1' }),
      base('u2', { animalId: '9100002', location: '', registered: true, dashTitle: '9100002', dashLoc: 'Location TBC' }),
      base('u3', { animalId: '9100003', location: 'Pound 2' })
    ]);
    try {
      await c.page.click('#clearListBtn');
      await c.page.waitForTimeout(500);
      const dels = c.posts.filter(b => b.delete).map(b => b.delete.title).sort();
      t.ok(dels.join() === '9100001,9100003', tool.shift + ': Clear list removes the unfinished animals from the dashboard and keeps the completed one: ' + dels.join());
    } finally { await c.browser.close(); }

    /* 7. an animal deliberately kept off the dashboard stays off when its ID is edited */
    const o = await start(tool, [base('o1', { animalId: '9200001', location: 'Pound 1', dashOff: true })]);
    try {
      await o.page.evaluate(() => openExam('o1'));
      await o.page.fill('#' + tool.idField, '9200009');
      await o.page.dispatchEvent('#' + tool.idField, 'change');
      await o.page.waitForTimeout(300);
      t.ok(!o.posts.some(b => b.items || b.delete), tool.shift + ': "not on the dashboard" animals are left alone');
    } finally { await o.browser.close(); }
  }
  t.done();
})();
