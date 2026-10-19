// Dental chart on phones and tablets: fits the screen, big enough to tap, and the PDF can be shared/saved where downloads are limited.
const { chromium, devices } = require('playwright');
const path = require('path');
const t = require('./check')('dental-mobile');

const seed = () => {
  if (window.__seeded) return; window.__seeded = true;
  localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test');
  localStorage.setItem('ldh_surgery_shift_v1', JSON.stringify([{ id: 'a2', animalId: 'T-DENT', species: 'dog', surgType: 'dental' }]));
};
async function open(browser, opts, init) {
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true }, opts));
  await ctx.addInitScript(seed); if (init) await ctx.addInitScript(init);
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../dental.html'));
  await page.selectOption('#animalPick', 'a2');
  await page.click('#startA');
  return { page, errors, ctx };
}
(async () => {
  const browser = await chromium.launch();
  const sizes = [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['small phone', { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }], ['tablet upright', { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true }], ['tablet sideways', { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }]];
  for (const [name, o] of sizes) {
    const { page, errors, ctx } = await open(browser, o);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    t.ok(m.sw <= m.iw, name + ': nothing runs off the side of the screen (' + m.sw + ' <= ' + m.iw + ')');
    const teeth = await page.$$eval('.tooth', ts => ts.map(x => { const r = x.getBoundingClientRect(); return [r.width, r.height, r.right, r.left]; }));
    t.ok(teeth.length === 42 && teeth.every(r => r[0] >= 28 && r[1] >= 60 && r[2] <= o.viewport.width + 1 && r[3] >= -1), name + ': all 42 teeth are on screen and big enough to tap (narrowest ' + Math.min(...teeth.map(r => r[0])).toFixed(0) + 'px)');
    const small = await page.$$eval('#toothPanel select, #toothPanel input:not([type=checkbox]), #toothPanel .checks label, #desc, #procedure, #tpClose, #tpPrev, #pdfBtn, [data-grade]', els => els.filter(e => e.offsetParent).filter(e => e.getBoundingClientRect().height < 43 || (/^(SELECT|INPUT)$/.test(e.tagName) && parseFloat(getComputedStyle(e).fontSize) < 16)).map(e => e.id || e.tagName + (e.dataset.field || e.dataset.check || '')));
    t.ok(small.length === 0, name + ': controls are at least 44px tall and fields use 16px text (no iPhone zoom): ' + small.join(','));
    t.ok(errors.length === 0, name + ': no page errors ' + errors.join(';'));
    await ctx.close();
  }

  // a phone/tablet that can share files: the PDF goes to the share sheet
  {
    const init = () => { navigator.canShare = () => true; navigator.share = async d => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; }; };
    const { page, ctx } = await open(browser, sizes[0][1], init);
    t.ok(/Share/.test(await page.textContent('#pdfBtn')), 'on a touch device the button says Share / save PDF');
    await page.click('#pdfBtn');
    await page.waitForFunction(() => window.__shared);
    const sh = await page.evaluate(() => window.__shared);
    t.ok(sh.name === 'T-DENT_dental_chart.pdf' && sh.type === 'application/pdf' && sh.size > 3000, 'the chart is handed to the share sheet as a PDF file: ' + JSON.stringify(sh));
    await ctx.close();
  }
  // sharing refused (not cancelled): falls back to a normal download
  {
    const init = () => { navigator.canShare = () => true; navigator.share = async () => { const e = new Error('no'); e.name = 'NotAllowedError'; throw e; }; };
    const { page, ctx } = await open(browser, sizes[0][1], init);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pdfBtn')]);
    t.ok(dl.suggestedFilename() === 'T-DENT_dental_chart.pdf', 'if sharing fails it downloads instead');
    await ctx.close();
  }
  // no sharing and no download: the PDF opens in a tab so the browser can save it
  {
    const { page, ctx } = await open(browser, sizes[0][1]);
    const [pop] = await Promise.all([page.context().waitForEvent('page'), page.click('#openPdfBtn')]);
    t.ok(!!pop, 'Open PDF opens the PDF in a new tab (the browser then offers its own save / share)');
    await ctx.close();
  }
  await browser.close();
  t.done();
})();
