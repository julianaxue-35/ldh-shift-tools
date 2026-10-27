// "noroclav 500mg: 2T PO BID": a bare T is a tablet, so mg/kg = strength x tablets / weight, and the chart dose reads "2 tablets".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
global.window = {};
createRequire(import.meta.url)('../medchart.js');
const M = window.MedChart;

test('mg/kg counts the tablets written as T (25 kg dog, 500 mg tablets)', () => {
  const want = { '1T': 20, '2T': 40, '1/2T': 10, '0.5T': 10, '1.5T': 30, '1 T': 20, '2t': 40, '1 tablet': 20, '2 tablets': 40, '1/2 tablet': 10, '1 1/2 tablets': 30 };
  for (const [q, mgkg] of Object.entries(want)) {
    const r = M.computeMgPerKg('noroclav 500mg: ' + q + ' PO BID', 25, 'dog');
    assert.equal(r.mgPerKg, mgkg, q);
  }
});

test('T does not swallow the start of TID or another word', () => {
  assert.equal(M.computeMgPerKg('noroclav 500mg: 1 TID', 25, 'dog').mgPerKg, 20);   // no tablet count named: one tablet
  assert.equal(M.computeMgPerKg('noroclav 500mg: 2 TID', 25, 'dog').mgPerKg, 20);   // "2 TID" is not "2 T"
  assert.equal(M.annotateMgPerKg('noroclav 500mg: 2T PO BID', 25, 'dog'), 'noroclav 500mg (40mg/kg): 2T PO BID');
});

test('the chart reads "2T" as 2 tablets (no second 500mg in the label)', () => {
  const m = M.parseMedPlan('noroclav 500mg: 2T PO BID for 5 days')[0];
  assert.equal(m.doseText, '2 tablets'); assert.match(m.labelText, /^noroclav 500mg 2 tablets orally twice daily/);
  assert.equal(M.parseMedPlan('noroclav 500mg: 1T PO BID for 5 days')[0].doseText, '1 tablet');
  assert.equal(M.parseMedPlan('noroclav 500mg: 1/2T PO SID for 5 days')[0].doseText, '1/2 tablet');
  assert.equal(M.parseMedPlan('amoxyclav 250mg: give 1 1/2 tablets PO BID for 5 days')[0].doseText, '1 1/2 tablets');
  assert.equal(M.parseMedPlan('meloxicam 1.5mg: give 0.3ml PO SID for 3 days')[0].doseText, '0.3ml');
});
