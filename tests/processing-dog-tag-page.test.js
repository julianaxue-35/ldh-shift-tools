// Processing import in the page: dogs take the shelter tag, cats keep the Animal ID. Fictional animals only.
const { chromium } = require('playwright');
const path = require('path');
const t = require('./check')('processing-dog-tag-page');
(async () => {
  const b = await chromium.launch(); const c = await b.newContext();
  await c.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await c.addInitScript(() => { localStorage.setItem('ldhGateOk_v2', '1'); });
  const p = await c.newPage(); await p.goto('file://' + path.resolve(__dirname, '../processing.html')); await p.waitForTimeout(500);
  const head = ['AnimalID', 'Animal Name', 'Shelter Loc. / Kennel', 'Age', 'Sex', 'Due Date Out', 'Shelter Tag'];
  const got = await p.evaluate(head => parseInCareInventory([['Dog'], head, ['1180001', 'Rex', 'Pound 2 / 4', '2 years', 'Male', '', 'CZU627'], ['1180002', 'Max', 'Pound 2 / 5', '1 year', 'Male', '', ''],
    ['1180004', 'CZU 629', 'Pound 3 / 1', '1 year', 'Female', '', ''], ['Cat'], head, ['1180003', 'Tom', 'Cat Room 1 / 2', '1 year', 'Female', '', 'ABC123']]).rows.map(r => r.species + ' ' + r.animalId), head);
  t.ok(JSON.stringify(got) === JSON.stringify(['dog CZU627', 'dog 1180002', 'dog CZU629', 'cat 1180003']), 'dogs by tag (column or name), a dog without one keeps its Animal ID, cats keep the Animal ID: ' + JSON.stringify(got));
  await b.close(); t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 300)); process.exit(1); });
