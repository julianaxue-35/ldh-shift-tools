import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../medchart.js');
const M = globalThis.MedChart;
const one = t => M.parseMedPlan(t, 'dog')[0];

test('amoxyclav spelling / spacing variants are recognised', () => {
  ['Amoxi clav 250mg BID', 'Amoxy-clav 250mg BID', 'Amoxycillin clavulanate 1 tab BID', 'Amoxicillin/clavulanate 1 tab BID', 'Amoxicillin clavulanic acid 250mg BID']
    .forEach(l => { const r = one(l); assert.equal(r.matched, true, l); assert.equal(r.drugKey, 'amoxyclav', l); });
});
test('a one-letter misspelling is matched and the row says so', () => {
  const r = one('Trazadone 100mg 1 tab BID');
  assert.equal(r.drugKey, 'trazodone'); assert.ok(r.warnings.some(w => /Read "trazadone" as Trazodone/.test(w)));
  assert.equal(one('Mirtazipine 1.88mg SID').drugKey, 'mirtazapine');
});
test('fuzzy match never fires for an unrelated word or an exact hit', () => {
  assert.equal(one('1 tab zzzzzzzz 5mg BID').matched, false);
  assert.equal(one('Tramadol 50mg BID').matched, false);
  assert.equal(one('Gabapentin 100mg BID').warnings.some(w => /Read "/.test(w)), false);
});
test('an unrecognised drug shows its name, not the whole sentence', () => {
  assert.equal(one('Give 1 tablet of tramadol 50mg BID').drugLabel, 'tramadol');
  assert.equal(one('1 tab zzzzzzzz 5mg BID').drugLabel, 'zzzzzzzz');
  assert.equal(one('Cerenia 16mg 1 tab SID').drugLabel, 'Cerenia');
});
test('numbered "Start <drug>" lines: number and Start are not part of the name or label', () => {
  const r = one('1. Start gabapentin 100mg: give 1 cap PO BID for 5 days');
  assert.equal(r.drugKey, 'gabapentin'); assert.equal(r.drugLabel, 'Gabapentin 100mg');
  assert.ok(/gabapentin 100mg/i.test(r.labelText), r.labelText);   // the label keeps the vet's own words
  assert.equal(one('3. Start tramadol 50mg 1 tab BID 3 days').drugLabel, 'tramadol');
  assert.equal(M.parseMedPlan('1. Start meloxicam SID x 5 days\n2. Start gabapentin BID 5 days', 'dog').length, 2);
});
test('duration without "for": 7d, 7 days, 2 weeks', () => {
  assert.equal(one('Amoxyclav 250mg give 1 tab BID 7d').days, 7);
  assert.equal(one('Amoxyclav 250mg 1 tab BID 7 days').days, 7);
  assert.equal(one('Doxycycline 100mg 1 tab BID 2 weeks').days, 14);
  assert.equal(one('Gabapentin 100mg 1 cap BID for 5 days').days, 5);
});
test('a medication is only sent to the nurse when ticked (undefined = not ticked)', () => {
  const chart = { id: 'c', animalId: 'A1', createdAt: new Date().toISOString(), meds: [Object.assign(one('Meloxicam 1.5mg/ml: 0.3ml SID x 5 days'), { nurseSend: undefined })] };
  assert.equal(M.nurseLabels(chart).length, 0);
  chart.meds[0].nurseSend = true; assert.equal(M.nurseLabels(chart).length, 1);
});
