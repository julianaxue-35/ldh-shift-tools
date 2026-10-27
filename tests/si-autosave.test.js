// Sick & Injured, Processing and Surgery: what is typed is saved as it is typed (not only when the field loses focus) and when the
// page is hidden. S&I and Processing also keep a hand edit of the note as a draft; S&I also survives another tab writing the list.
// (file name kept: it began as the S&I test.) Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('si-autosave');
const TOOLS = [
  { name: 'S&I', file: 'sick-injured.html', ls: 'ldh_sickinjured_shift_v1', handEdit: true, otherTab: true, species: 'dog' },
  { name: 'Processing', file: 'processing.html', ls: 'ldh_processing_shift_v1', handEdit: true, otherTab: false, species: 'dog' },
  { name: 'Surgery', file: 'surgery.html', ls: 'ldh_surgery_shift_v1', handEdit: false, otherTab: false, species: 'dog' }
];
async function run(tool) {
  const L = tool.name + ': ', FILE = 'file://' + path.resolve(__dirname, '..', tool.file);
  const browser = await chromium.launch(); const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await ctx.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('ldhGateOk_v2', '1'); localStorage.setItem('ldh_sync_code_v1', 'test'); localStorage.setItem('ldh_processing_vetinit_v1', 'ZZ'); localStorage.setItem('__seeded', '1'); } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  const noModal = (pg) => pg.evaluate(() => { const m = document.getElementById('startShiftModal'); if (m) m.remove(); });
  try {
    await page.goto(FILE); await page.waitForTimeout(500); await noModal(page);
    await page.evaluate((sp) => {
      const mk = (o) => typeof makeAnimal === 'function' ? Object.assign(makeAnimal(o), { id: o.id }) : normalizeAnimal(o);
      const a = mk({ id: 'fict1', animalId: 'FICT-1', species: sp, weight: '25', location: 'Pound 1' });
      const b = mk({ id: 'fict2', animalId: 'FICT-2', species: 'cat', weight: '4', location: 'Cat Room 1' });
      state.animals.push(a, b); saveShift(); renderShiftList(); openExam('fict1');
    }, tool.species);
    const animalJson = () => page.evaluate((ls) => { const l = JSON.parse(localStorage.getItem(ls) || '[]'); const a = l.find(x => x.id === 'fict1'); return a ? JSON.stringify(a) : ''; }, tool.ls);
    const field = (await page.$$eval('#examBody textarea', els => els.filter(e => e.offsetParent !== null).map(e => e.id)))[0];
    t.ok(!!field, L + 'the exam has a text box to type in (' + field + ')');
    const typed1 = 'Limping on the front left since last night.';
    await page.locator('#' + field).click(); await page.keyboard.type(typed1);
    t.ok(!(await animalJson()).includes(typed1), L + 'sanity: it is not saved the instant a key is pressed (it is saved after a short pause)');
    await page.waitForTimeout(1300);
    t.ok((await animalJson()).includes(typed1), L + 'typed text is saved by itself, without clicking away');
    await page.keyboard.type(' Worse on stairs.');
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
    t.ok((await animalJson()).includes(typed1 + ' Worse on stairs.'), L + 'it is also saved the moment the page is hidden or closed');
    if (tool.otherTab) {
      const p2 = await ctx.newPage(); await p2.goto(FILE); await p2.waitForTimeout(400); await noModal(p2);
      await p2.evaluate((ls) => { const l = JSON.parse(localStorage.getItem(ls)); const b = l.find(x => x.id === 'fict2'); b.location = 'Cat Room 2'; localStorage.setItem(ls, JSON.stringify(l)); }, tool.ls);
      await page.waitForTimeout(300);
      await page.locator('#' + field).click(); await page.keyboard.press('End'); await page.keyboard.type(' Eating well.'); await page.waitForTimeout(1300);
      t.ok((await animalJson()).includes(typed1 + ' Worse on stairs. Eating well.'), L + 'a second tab changing the list does not lose what is being typed');
      t.ok(await page.evaluate(() => state.animals.find(a => a.id === 'fict2').location === 'Cat Room 2'), L + 'and the other tab\'s change to another animal is picked up');
      await p2.close();
    }
    if (tool.handEdit) {
      await page.click('#editToggleBtn');
      await page.locator('#noteEditArea').fill('MY OWN WORDING FOR THE NOTE');
      await page.locator('#' + field).click(); await page.keyboard.type(' more.');
      t.ok((await page.inputValue('#noteEditArea')) === 'MY OWN WORDING FOR THE NOTE', L + 'other fields no longer overwrite the note while it is being hand-edited');
      await page.waitForTimeout(1300);
      t.ok((await animalJson()).includes('"noteEditDraft":"MY OWN WORDING FOR THE NOTE"'), L + 'the hand edit is kept as a draft as you type');
      await page.reload(); await page.waitForTimeout(600); await noModal(page);
      await page.evaluate(() => openExam('fict1'));
      t.ok((await page.inputValue('#noteEditArea')) === 'MY OWN WORDING FOR THE NOTE' && !(await page.locator('#noteEditArea').evaluate(e => e.classList.contains('hidden'))), L + 'after a reload the unsaved hand edit is back in the box');
      await page.click('#editToggleBtn');
      const j = await animalJson();
      t.ok(j.includes('"noteEdited":"MY OWN WORDING FOR THE NOTE"') && !j.includes('noteEditDraft'), L + 'pressing Save makes it the note and clears the draft');
    }
    t.ok(errs.length === 0, L + 'no page errors: ' + errs.join('; '));
  } finally { await browser.close(); }
}
(async () => { for (const tool of TOOLS) await run(tool); t.done(); })();
