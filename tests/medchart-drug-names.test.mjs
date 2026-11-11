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
