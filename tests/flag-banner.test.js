// Processing: an animal that is also flagged on the dashboard shows it, and the flag can be marked done with a quick plan.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('flag-banner');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const posts = [];
  let flags = [{ title: 'F-100', location: 'Cat Room 1 / 3', condition: 'vomiting', problem: 'twice since breakfast', type: 'shelter' }];
  let doneReply = { status: 200, body: { ok: true, updated: 1, found: 1, waiting_medication: 0 } };
  let up = true;
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    posts.push(body);
    if (!up) return route.abort();
    const h = { 'access-control-allow-origin': '*' };
    if (body.flag_check) return route.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ ok: true, flags }) });
    if (body.flag_done) return route.fulfill({ status: doneReply.status, contentType: 'application/json', headers: h, body: JSON.stringify(doneReply.body) });
    route.fulfill({ status: 200, contentType: 'application/json', headers: h, body: '{"ok":true,"done":[]}' });
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
    localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto('file://' + path.resolve(__dirname, '../processing.html'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    state.animals = [makeAnimal({ animalId: 'F-100', location: 'Cat Room 1', species: 'cat' }), makeAnimal({ animalId: 'N-200', location: 'Cat Room 1', species: 'cat' })];
    saveShift(); renderShiftList();
  });
  await page.evaluate(() => refreshFlags());
  await page.waitForTimeout(400);
  const ask = posts.find(b => b.flag_check);
  t.ok(ask && ask.flag_check.titles.sort().join() === 'F-100,N-200', 'it asks the dashboard about the animals on the list: ' + JSON.stringify(ask));

  const cards = await page.$$eval('.animal-card', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
  t.ok(cards.find(c => /F-100/.test(c) && /Flagged/.test(c)) && !cards.find(c => /N-200/.test(c) && /Flagged/.test(c)), 'only the flagged animal carries the flag badge');

  await page.evaluate(() => openExam(state.animals[0].id));
  await page.waitForSelector('#flagBanner');
  const banner = (await page.textContent('#flagBanner')).replace(/\s+/g, ' ');
  t.ok(/Also flagged on the dashboard/.test(banner) && /Cat Room 1 \/ 3/.test(banner) && /vomiting/.test(banner) && /twice since breakfast/.test(banner), 'the exam shows where and why it is flagged: ' + banner);
  await page.evaluate(() => openExam(state.animals[1].id));
  t.ok(await page.locator('#flagBanner').count() === 0, 'an unflagged animal shows no banner');
  await page.evaluate(() => openExam(state.animals[0].id));

  // a plan is required
  await page.click('#flagDoneBtn');
  await page.click('#flagSave');
  t.ok(/quick plan/i.test(await page.textContent('#flagErr')) && !posts.some(b => b.flag_done), 'no plan, nothing sent');

  // dashboard unreachable: not marked done, says so
  up = false;
  await page.fill('#flagPlanText', 'Eating well, no vomiting since. Recheck in 3 days.');
  await page.click('#flagSave');
  await page.waitForFunction(() => document.getElementById('flagErr').style.display === 'block' && /Not marked done/.test(document.getElementById('flagErr').textContent));
  t.ok(await page.evaluate(() => !state.animals[0].flagDoneAt), 'offline: it is NOT recorded as done');
  up = true;

  await page.click('#flagSave');
  await page.waitForFunction(() => !document.getElementById('flagModal'));
  const sent = posts.filter(b => b.flag_done).pop();
  t.ok(sent && sent.flag_done.title === 'F-100' && sent.flag_done.plan === 'Eating well, no vomiting since. Recheck in 3 days.', 'the quick plan is sent: ' + JSON.stringify(sent));
  const after = await page.evaluate(() => ({ done: state.animals[0].flagDoneAt, plan: state.animals[0].flagPlan }));
  t.ok(after.done && /Recheck in 3 days/.test(after.plan), 'recorded on the animal once the dashboard confirmed');
  t.ok(/marked done/.test(await page.textContent('#flagBanner')) && /Recheck in 3 days/.test(await page.textContent('#flagBanner')), 'the banner now says it is done');
  const cards2 = await page.$$eval('.animal-card', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
  t.ok(!cards2.find(c => /F-100/.test(c) && /⚑ Flagged/.test(c)), 'the flag badge is gone from the list');

  // a medication case stays open until the label is made
  flags = [{ title: 'N-200', location: 'Pound 2', condition: '', problem: 'Medication', type: 'medication', needs_medication: true }];
  doneReply = { status: 200, body: { ok: true, updated: 1, found: 1, waiting_medication: 1 } };
  dialogs.length = 0;
  await page.evaluate(() => refreshFlags());
  await page.waitForTimeout(300);
  await page.evaluate(() => openExam(state.animals[1].id));
  await page.waitForSelector('#flagDoneBtn');
  await page.click('#flagDoneBtn');
  await page.fill('#flagPlanText', 'Start meds.');
  await page.click('#flagSave');
  await page.waitForFunction(() => !document.getElementById('flagModal'));
  t.ok(dialogs.some(d => /stays open on the dashboard until the nurse has made the label/.test(d)), 'a medication case explains it stays open until the label is made');

  // someone else already finished it
  flags = [{ title: 'N-200', location: 'Pound 2', problem: 'x', type: 'shelter' }];
  await page.evaluate(() => { state.animals[1].flagDoneAt = ''; });
  doneReply = { status: 200, body: { ok: true, updated: 0, found: 0, waiting_medication: 0 } };
  await page.evaluate(() => refreshFlags());
  await page.waitForTimeout(300);
  dialogs.length = 0;
  await page.evaluate(() => openExam(state.animals[1].id));
  await page.click('#flagDoneBtn'); await page.fill('#flagPlanText', 'x'); await page.click('#flagSave');
  await page.waitForFunction(() => !document.getElementById('flagModal'));
  t.ok(dialogs.some(d => /no open flag/.test(d)), 'if the flag was already finished, it says so instead of claiming success');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  await browser.close();
  t.done();
})();
