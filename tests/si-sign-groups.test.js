// Sick & Injured: a flagged animal's suspected signs print as "Suspected signs: <Label, Label>" (sign groups; old single conditions fold into their group).
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('si-sign-groups');
const FILE = 'file://' + path.resolve(__dirname, '../sick-injured.html');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', (route) => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA')); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(FILE); await page.waitForTimeout(400);
  const label = (r) => page.evaluate((x) => flagHistoryLabel(x), Object.assign({ problem: 'Sneezing' }, r));
  try {
    let s = await label({ conditions: ['gi', 'urinary'] });
    t.ok(s.includes('\nSuspected signs: GI signs, Urinary signs'), 'conditions [gi, urinary]: ' + JSON.stringify(s));
    t.ok(!s.includes('Suspected condition'), 'the old "Suspected condition" wording is gone');
    s = await label({ condition: 'cat_flu' });
    t.ok(s.includes('Suspected signs: Respiratory signs') && !s.includes('Cat flu'), 'cat_flu folds to Respiratory signs: ' + JSON.stringify(s));
    s = await label({ conditions: ['vomiting', 'diarrhoea'] });
    t.ok(s.includes('Suspected signs: GI signs') && s.split('GI signs').length === 2, 'vomiting + diarrhoea give GI signs once: ' + JSON.stringify(s));
    s = await label({ conditions: ['respiratory', 'cat_flu', 'gi'] });
    t.ok(s.includes('Suspected signs: Respiratory signs, GI signs'), 'de-duplicated in order: ' + JSON.stringify(s));
    s = await label({ condition: 'GI signs, Urinary signs' });
    t.ok(s.includes('Suspected signs: GI signs, Urinary signs'), 'a pre-joined string prints as is: ' + JSON.stringify(s));
    s = await label({ condition: 'vomiting' });
    t.ok(s.includes('Suspected signs: GI signs'), 'a lone raw key becomes its label');
    s = await label({ conditions: ['mystery_key'] });
    t.ok(s.includes('Suspected signs: mystery_key'), 'an unknown key prints raw: ' + JSON.stringify(s));
    s = await label({ condition: 'Some free text' });
    t.ok(s.includes('Suspected signs: Some free text'), 'unknown free text prints raw');
    s = await label({});
    t.ok(!s.includes('Suspected'), 'no condition gives no Suspected line');
    s = await label({ conditions: [], condition: '  ' });
    t.ok(!s.includes('Suspected'), 'empty conditions and blank condition give no Suspected line');
    s = await label({ conditions: ['neonatal', 'wounds_injury', 'other'] });
    t.ok(/Suspected signs: Kitten \/ puppy signs, Wounds \/ pain \/ swelling, Other/.test(s), 'neonatal, wounds_injury and other: ' + JSON.stringify(s));

    /* the URL hand-off passes conditions through to the history */
    const items = JSON.stringify([{ id: 'SG-1', location: 'Pound 1', problem: 'Off food', conditions: ['gi', 'urinary'] }]);
    const p2 = await ctx.newPage();
    p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(FILE + '?items=' + encodeURIComponent(items)); await p2.waitForTimeout(500);
    const list = await p2.evaluate(() => JSON.parse(localStorage.getItem('ldh_sickinjured_shift_v1') || '[]'));
    t.ok(list.length === 1 && /Suspected signs: GI signs, Urinary signs/.test(list[0].history || ''), 'hand-off item with conditions lands in History: ' + JSON.stringify(list.map(a => a.history)));
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
