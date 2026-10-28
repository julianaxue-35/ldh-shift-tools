// Sick & Injured: "Duplicate for littermates" copies the whole entry; ID and weight are left for each animal. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('si-duplicate');
const FILE = 'file://' + path.resolve(__dirname, '../sick-injured.html');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', (route) => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  const seed = [{ id: 'orig', animalId: 'LIT-1', location: 'Cat Room 1 / 3', species: 'cat', weight: '1.2', registered: true, flagged: true,
    treatment: 'Metacam 0.05 ml PO SID', history: 'Sneezing for 3 days', plan: 'Recheck in 2 days', aaSentAt: '2026-10-28T01:00:00Z', aaSig: 'x', aaSentId: 'LIT-1', bhSentAt: '2026-10-28T01:00:00Z', bhSig: 'y' }];
  await ctx.addInitScript((a) => {
    localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    localStorage.setItem('ldh_sickinjured_shift_v1', JSON.stringify(a));
    localStorage.setItem('ldh_sickinjured_shift_v1_date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }));
  }, seed);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(d.type() === 'prompt' ? '2' : undefined); });
  await page.goto(FILE); await page.waitForTimeout(400);
  try {
    await page.evaluate(() => openExam('orig'));
    t.ok(await page.locator('#duplicateBtn').count() === 1, 'the animal page has Duplicate for littermates');
    await page.click('#duplicateBtn');
    await page.waitForTimeout(300);
    const list = await page.evaluate(() => JSON.parse(localStorage.getItem('ldh_sickinjured_shift_v1')));
    t.ok(list.length === 3, 'two copies were added: ' + list.length);
    const c = list[1];
    t.ok(c.treatment === 'Metacam 0.05 ml PO SID' && c.history === 'Sneezing for 3 days' && c.plan === 'Recheck in 2 days' && c.location === 'Cat Room 1 / 3', 'the whole entry is copied');
    t.ok(c.animalId === '' && c.weight === '', 'ID and weight are left blank for each littermate');
    t.ok(!c.registered && !c.flagged && !c.aaSentAt && !c.aaSig && !c.aaSentId && !c.bhSentAt && !c.bhSig, 'a copy is not registered, flagged or marked as sent');
    t.ok(list[1].id !== list[2].id && list[1].id !== 'orig', 'each copy has its own record id');
    t.ok(list[0].animalId === 'LIT-1' && list[0].weight === '1.2', 'the original is untouched');
    t.ok(dialogs.some(d => /ID and weight/.test(d)), 'she is told to fill in the ID and weight');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('|'));
  } finally { await browser.close(); }
  t.done();
})();
