// Sick & Injured tool: share-with-Admission-AA switch, auto-send on register, NOT SENT safety net, guards.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('si-aa');
const FILE = 'file://' + path.resolve(__dirname, '../sick-injured.html');

const animal = (id, animalId, extra) => Object.assign({
  id, animalId, location: 'Pound 1', species: 'dog', registered: false, noteEdited: 'Note for ' + animalId, weight: '10'
}, extra || {});

async function start(animals, { online = true, shared = false, refuse = '' } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const sent = [];
  let up = online;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (!up) return route.abort();
    if (body.aa && refuse) return route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: refuse }) });
    if (body.aa) sent.push(body.aa);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body.aa ? { ok: true } : {}) });
  });
  await ctx.addInitScript((seed) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_sickinjured_shift_v1', JSON.stringify(seed.animals));
    localStorage.setItem('ldh_sickinjured_shift_v1_date', new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}));
    if (seed.shared) localStorage.setItem('ldh_aa_share_sick_injured', '1');
  }, { animals, shared });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto(FILE);
  await page.waitForTimeout(400);
  return { browser, page, sent, errors, dialogs, setOnline: (v) => { up = v; } };
}

(async () => {
  /* 1. Off by default: nothing sent, nothing nags. */
  let s = await start([animal('a', 'T-100', { registered: true })]);
  try {
    t.ok(!(await s.page.isChecked('#aaShareToggle')), 'the switch is off by default');
    t.ok(await s.page.isHidden('#aaRedBar'), 'no red bar while the switch is off');
    t.ok(s.sent.length === 0, 'nothing is sent while the switch is off');
  } finally { await s.browser.close(); }

  /* 2. Switch on mid-shift: already-registered animals are sent once each, pending ones are not. */
  s = await start([animal('a', 'T-100', { registered: true }), animal('b', 'T-101', { registered: true }), animal('c', 'T-102')]);
  try {
    await s.page.check('#aaShareToggle');
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('2 sent'));
    t.ok(s.sent.length === 2 && s.sent.every(x => x.kind === 'si_note'), 'catch-up sent the 2 registered animals only: ' + s.sent.map(x => x.animal_id));
    t.ok(s.sent.some(x => x.animal_id === 'T-100' && x.payload.text === 'Note for T-100' && x.payload.docx_b64), 'payload has the note text and a Word file');
    t.ok(await s.page.isHidden('#aaRedBar'), 'no red bar when everything is sent');

    /* 3. Registering another animal sends it automatically. */
    await s.page.evaluate(() => { const a = state.animals.find(x => x.id === 'c'); a.registered = true; saveShift(); aaAfterRegister(a); });
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('3 sent'));
    t.ok(s.sent.length === 3 && s.sent[2].animal_id === 'T-102', 'a newly registered animal is sent automatically');

    /* 4. Edited after sending: flagged, then resend updates. */
    await s.page.evaluate(() => { const a = state.animals.find(x => x.id === 'a'); a.noteEdited = 'Edited note'; saveShift(); renderAaShare(); });
    t.ok(/changed since sent/i.test(await s.page.textContent('#aaShareList')), 'an edited note shows as changed since sent');
    t.ok(await s.page.isVisible('#aaRedBar'), 'the red bar appears for a changed note');
    await s.page.click('.aa-resend[data-id="a"]');
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('3 sent') && !document.querySelector('#aaShareSummary').textContent.includes('not sent'));
    t.ok(s.sent[3].animal_id === 'T-100' && s.sent[3].payload.text === 'Edited note', 'resend carries the edited text');
    t.ok(await s.page.isHidden('#aaRedBar'), 'red bar clears after the resend');

    /* 5. Clear list turns the switch off. */
    await s.page.click('#clearListBtn');
    t.ok(await s.page.isChecked('#aaShareToggle') === false, 'Clear list turns the switch off');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }

  /* 6. Offline all shift: NOT SENT, red bar, guards warn, Resend works when signal returns. */
  s = await start([animal('a', 'T-100', { registered: true }), animal('n', '', { registered: true })], { online: false, shared: true });
  try {
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.length > 0);
    t.ok(/not sent/i.test(await s.page.textContent('#aaShareList')), 'an unsent animal is listed as NOT SENT');
    t.ok(/no ID/i.test(await s.page.textContent('#aaShareList')), 'a registered animal with no ID is listed as "no ID, can\'t send"');
    t.ok(await s.page.isVisible('#aaRedBar') && /not sent/i.test(await s.page.textContent('#aaRedBar')), 'the red bar names the problem');
    t.ok(s.sent.length === 0, 'nothing reached the dashboard while offline');
    s.dialogs.length = 0;
    await s.page.evaluate(() => { document.querySelector('#exportWordBtn').click(); });
    await s.page.waitForTimeout(300);
    t.ok(s.dialogs.some(d => /NOT been sent to the Admission AA/i.test(d)), 'exporting while unsent asks first: ' + s.dialogs.join(' | ').slice(0, 120));
    s.setOnline(true);
    await s.page.click('#aaResendAll');
    await s.page.waitForFunction(() => document.querySelector('#aaShareSummary').textContent.includes('1 sent'));
    t.ok(s.sent.length === 1 && s.sent[0].animal_id === 'T-100', 'Resend all sends what it can once signal returns');
    t.ok(await s.page.isVisible('#aaRedBar'), 'the no-ID animal keeps the red bar up until it has an ID');
  } finally { await s.browser.close(); }

  /* 7. Review fixes. */
  const sentOf = (id, extra) => animal(id, 'T-' + id, Object.assign({ registered: true, aaSentAt: '2026-10-18T01:00:00Z', noteEdited: 'Date: 18 Oct 2026    Vet: JX    Nurse: AB\nExam normal.\nJX' }, extra || {}));
  s = await start([sentOf('a', { aaSig: require('../aa-share.js').sig(require('../aa-share.js').normalize('Date: 18 Oct 2026    Vet: JX    Nurse: AB\nExam normal.\nJX', ['JX', 'AB'])) })], { shared: true });
  try {
    await s.page.evaluate(() => { document.getElementById('vetInit').value = 'JX'; document.getElementById('nurseInit').value = 'AB'; renderAaShare(); });
    t.ok(/1 sent/.test(await s.page.textContent('#aaShareSummary')), 'a note sent earlier shows as sent');
    await s.page.evaluate(() => { document.getElementById('vetInit').value = 'KL'; document.getElementById('nurseInit').value = 'CD';
      const a = state.animals[0]; a.noteEdited = 'Date: 19 Oct 2026    Vet: KL    Nurse: CD\nExam normal.\nKL'; renderAaShare(); });
    t.ok(/1 sent/.test(await s.page.textContent('#aaShareSummary')) && await s.page.isHidden('#aaRedBar'), 'changing initials or date does NOT make sent notes look edited');
    await s.page.evaluate(() => { state.animals[0].noteEdited += '\nWeight 13 kg'; renderAaShare(); });
    t.ok(/changed since sent/i.test(await s.page.textContent('#aaShareList')), 'a real edit still shows as changed');
  } finally { await s.browser.close(); }

  s = await start([sentOf('a', { aaSig: 'x' })], { shared: true });
  try {
    await s.page.evaluate(() => { document.getElementById('vetInit').value = 'JX'; document.getElementById('nurseInit').value = 'AB'; state.animals.forEach(a => { a.aaSig = AAShare.sig(aaSigText(a)); }); saveShift(); renderAaShare(); });
    await s.page.click('#clearRegisteredBtn');
    await s.page.waitForTimeout(300);
    t.ok(await s.page.evaluate(() => state.animals.length) === 0, 'Clear exported emptied the list');
    t.ok(await s.page.isChecked('#aaShareToggle') === false, 'the switch turns itself off whenever the list becomes empty');
  } finally { await s.browser.close(); }

  s = await start([sentOf('a')], { shared: true });
  try {
    s.dialogs.length = 0;
    s.dialogs.length = 0;
    await s.page.evaluate(() => { aaWarnRetract(state.animals[0]); });
    t.ok(s.dialogs.some(d => /T-a/.test(d) && /already.*Admission AA/i.test(d)), 'undoing/deleting something already sent warns the vet and names the animal: ' + s.dialogs.join(' | ').slice(0, 140));
    s.dialogs.length = 0;
    await s.page.evaluate(() => { aaWarnRetract({ animalId: 'T-unsent', aaSentAt: null }); });
    t.ok(s.dialogs.length === 0, 'no warning for an animal that was never sent');
    s.dialogs.length = 0;
    await s.page.evaluate(() => { const a = state.animals[0]; a.registered = true; a.animalId = 'T-NEW'; a.aaSentId = 'T-a'; return aaSendAnimal(a); });
    await s.page.waitForTimeout(500);
    t.ok(s.dialogs.some(d => /T-a/.test(d) && /remove/i.test(d)), 'sending under a corrected ID tells the vet the old card is still there: ' + s.dialogs.join(' | ').slice(0, 160));
  } finally { await s.browser.close(); }

  s = await start([animal('a', 'T-100', { registered: true })], { shared: true, refuse: 'The note is too long (limit 20,000 characters).' });
  try {
    await s.page.evaluate(() => aaSendPending());
    await s.page.waitForTimeout(500);
    t.ok(/too long/i.test(await s.page.textContent('#aaShareList')), 'a refusal shows its reason next to NOT SENT');
  } finally { await s.browser.close(); }
  t.done();
})();
