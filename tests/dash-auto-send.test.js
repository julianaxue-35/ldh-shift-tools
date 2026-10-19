// Processing + Sick & Injured: every animal goes to the dashboard by default (no switch, no buttons), and a send lost to bad wifi is retried by itself.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const t = require('./check')('dash-auto-send');
const TOOLS = [['processing.html', 'processing'], ['sick-injured.html', 'sick_injured']];
(async () => {
  for (const [file, shift] of TOOLS) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    t.ok(!/parsedDashChk|Also add these to the dashboard|dashResendBtn/.test(src), shift + ': no opt-out switch and no extra buttons on the list');
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const posts = []; let offline = true;
    await ctx.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (!url.includes('/functions/v1/clever-endpoint')) return route.abort();
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
      let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
      if (offline && (body.items || body.title)) return route.abort();     // patchy wifi
      posts.push(body);
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"done":[]}' });
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
      localStorage.setItem('ldh_processing_vetinit_v1', 'jx'); localStorage.setItem('ldh_processing_vetinit_v1_day', new Date().toLocaleDateString('en-CA'));
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto('file://' + path.resolve(__dirname, '..', file));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const mk = (id, loc, extra) => Object.assign(makeAnimal({ animalId: id, location: loc, species: 'dog', weight: '10', noteText: '', otherReminders: [] }), { id: 'x' + id }, extra);
      state.animals = ['A-1', 'A-2', 'A-3'].map((id, i) => mk(id, 'Pound ' + (i + 1)));
      state.animals.push(mk('A-4', 'Pound 4', { dashTitle: 'A-4', dashLoc: 'Pound 4' }));     // "sent" by an older version that never checked
      saveShift(); renderShiftList(); localStorage.setItem(LS_SHIFT_DATE, todayStr());
    });
    await page.evaluate(() => dashCatchUp()); await page.waitForTimeout(500);
    t.ok(posts.filter(b => b.items).length === 0, shift + ': while offline nothing reaches the dashboard');
    t.ok(await page.evaluate(() => state.animals.every(a => !a.dashConfirmed)), shift + ': and nothing is wrongly remembered as sent');
    offline = false;
    await page.evaluate(() => dashCatchUp()); await page.waitForTimeout(600);
    const items = (posts.find(b => b.items) || { items: [] }).items.map(i => i.title).sort();
    t.ok(items.join() === 'A-1,A-2,A-3,A-4', shift + ': back online, the next pass sends the whole list, including the one an older version only thought it had sent: ' + items.join());
    t.ok(await page.evaluate(() => state.animals.every(a => a.dashConfirmed)), shift + ': all confirmed');
    posts.length = 0; await page.evaluate(() => dashCatchUp()); await page.waitForTimeout(300);
    t.ok(posts.filter(b => b.items).length === 0, shift + ': once confirmed, nothing is sent again');
    t.ok(errors.length === 0, shift + ': no page errors ' + errors.join('; '));
    await browser.close();
  }
  t.done();
})();
