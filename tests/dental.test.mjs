import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../dental.js');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');

test('canine has 20 upper and 22 lower teeth, feline 16 and 14, on the Triadan numbers of the paper charts', () => {
  assert.equal(D.toothList('canine').length, 42);
  assert.equal(D.toothList('feline').length, 30);
  const f = D.toothList('feline');
  assert.ok(f.includes(109) && f.includes(309) && !f.includes(105) && !f.includes(305) && !f.includes(306));
  const c = D.toothList('canine');
  assert.ok(c.includes(110) && c.includes(311) && c.includes(411) && !c.includes(111));
});
test('layout: upper right | upper left, lower right | lower left, molars outside, incisors at the midline', () => {
  const Q = D.quadrants('canine');
  assert.deepEqual(Q.upper.map(q => q.quadrant), [1, 2]);
  assert.deepEqual(Q.lower.map(q => q.quadrant), [4, 3]);
  assert.deepEqual(Q.upper[0].teeth, [110, 109, 108, 107, 106, 105, 104, 103, 102, 101]);
  assert.deepEqual(Q.upper[1].teeth.slice(0, 3), [201, 202, 203]);
});
test('root counts', () => {
  assert.equal(D.toothInfo('canine', 108).roots, 3);   // upper fourth premolar
  assert.equal(D.toothInfo('canine', 104).roots, 1);
  assert.equal(D.toothInfo('canine', 407).roots, 2);
  assert.equal(D.toothInfo('feline', 108).roots, 3);
  assert.equal(D.toothInfo('feline', 105), null);
  assert.equal(D.toothInfo('canine', 408).name, 'Mandibular right fourth premolar');
});
test('tokens: words in, abbreviations out', () => {
  const t = { ccf: true, furcation: '2', mobility: '1', pocketB: '4', pocketL: '3', ext: 'surgical' };
  assert.deepEqual(D.toothTokens(t), ['CCF', 'FE2', 'M1', 'PP B4/L3', 'XS']);
  assert.deepEqual(D.toothTokens({ pocketL: '5' }), ['PP L5']);
  assert.deepEqual(D.toothTokens({ missing: true, ccf: true }), ['MISS']);
  assert.deepEqual(D.toothTokens({ ext: 'nonsurgical', resorption: '2', retained: true }), ['RTR', 'TR2', 'XN']);
  assert.equal(D.toothTokens({}).length, 0);
});
test('extraction sentence matches the surgery-note wording, surgical first, teeth in order', () => {
  const chart = { teeth: { 407: { ext: 'surgical' }, 402: { ext: 'nonsurgical' }, 401: { ext: 'nonsurgical' }, 104: { ccf: true } } };
  assert.equal(D.extractionSentence(chart), '407 surgical extraction; 401, 402 non-surgical extraction');
  assert.equal(D.extractionSentence({ teeth: {} }), '');
});
test('summary sentence: G_/4 plus the description', () => {
  assert.equal(D.summarySentence({ grade: '3', desc: 'moderate gingivitis over the LU arcade' }), 'G3/4 dental disease, moderate gingivitis over the LU arcade.');
  assert.equal(D.summarySentence({ grade: '2', desc: '' }), 'G2/4 dental disease.');
  assert.equal(D.summarySentence({ grade: '', desc: '' }), '');
});
test('the surgery note is filled in by itself and refreshed, never duplicated', () => {
  const tpl = 'Surgical Procedure:\nTreatment - for per tooth report refer to chart.\n(Surgical / Closed / No) extractions performed.\n(Sealing / Composite / No) restorations performed.\nSoft food until recheck.';
  const c1 = { grade: '3', desc: 'moderate gingivitis', procedure: 'spx', teeth: { 407: { ext: 'surgical' }, 401: { ext: 'nonsurgical' }, 402: { ext: 'nonsurgical' } } };
  const n1 = D.applyToNote(tpl, c1);
  assert.ok(n1.includes('Refer to dental chart. G3/4 dental disease, moderate gingivitis. Scale and polish with extractions.\nExtractions: 407 surgical extraction; 401, 402 non-surgical extraction.'));
  assert.ok(!n1.includes('(Surgical / Closed / No)') && n1.includes('Soft food until recheck.'));
  const c2 = { grade: '3', desc: 'moderate gingivitis', procedure: 'spx', teeth: { 407: { ext: 'surgical' } } };
  const n2 = D.applyToNote(n1, c2);
  assert.equal((n2.match(/Refer to dental chart\./g) || []).length, 1);
  assert.ok(n2.includes('Extractions: 407 surgical extraction.') && !n2.includes('401'));
  assert.equal(D.applyToNote(n2, c2), n2);                                  // idempotent
  const n3 = D.applyToNote('Own note', { grade: '1', procedure: 'sp', teeth: {} });
  assert.equal(n3, 'Own note\n\nRefer to dental chart. G1/4 dental disease. Scale and polish.\nExtractions: none.');
});
test('the PDF is one animal, draws the chart and lists the abbreviation key', () => {
  const chart = { animalId: 'T-100', species: 'canine', grade: '3', desc: 'moderate gingivitis over the LU arcade', procedure: 'spx', day: '2026-10-19', vet: 'JX',
    teeth: { 408: { ext: 'surgical', furcation: '2' }, 104: { ccf: true }, 309: { missing: true } } };
  const doc = D.buildPdf(chart, jsPDF, { compress: false });
  const out = doc.output();
  assert.ok(out.startsWith('%PDF'));
  assert.equal(doc.getNumberOfPages(), 1);
  ['Canine Dental Chart', 'T-100', 'G3/4 dental disease', 'Scale and polish with extractions', 'Extractions: 408 surgical extraction', 'Abbreviation key', 'Complicated crown fracture', 'Extraction, non-surgical', 'Tooth resorption', 'XS', 'FE2'].forEach(s => assert.ok(out.includes(s), 'PDF contains ' + s));
  const cat = D.buildPdf({ animalId: 'C-1', species: 'feline', teeth: {} }, jsPDF, { compress: false }).output();
  assert.ok(cat.includes('Feline Dental Chart'));
});

test('planned extractions are shown as pXS/pXN, flagged in orange, and kept out of the surgery note until extracted', () => {
  assert.deepEqual(D.toothTokens({ ext: 'surgical', extPlanned: true }), ['pXS']);
  assert.deepEqual(D.toothTokens({ ext: 'nonsurgical', extPlanned: true }), ['pXN']);
  assert.equal(D.toothClass({ ext: 'surgical', extPlanned: true }), 'planned');
  assert.equal(D.toothClass({ ext: 'surgical' }), 'ext');
  const chart = { teeth: { 407: { ext: 'surgical', extPlanned: true }, 401: { ext: 'nonsurgical' } } };
  assert.equal(D.extractionSentence(chart), '401 non-surgical extraction');
  assert.equal(D.extractionSentence(chart, true), '407 surgical extraction');
  assert.ok(D.abbreviationKey().some(r => r[0] === 'pXS'));
});
test('charting order: 101-110, then 411-401, 301-311, 210-201; or the loop reversed from 201', () => {
  const a = D.route('canine', 'A');
  assert.equal(a.length, 42);
  assert.deepEqual(a.slice(0, 11), [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 411]);
  assert.deepEqual(a.slice(-3), [203, 202, 201]);
  assert.equal(D.nextTooth('canine', 110, 'A'), 411);
  assert.equal(D.nextTooth('canine', 401, 'A'), 301);
  assert.equal(D.nextTooth('canine', 311, 'A'), 210);
  assert.equal(D.nextTooth('canine', 201, 'A'), null);
  assert.equal(D.nextTooth('feline', 104, 'A'), 106);          // cats have no 105
  assert.equal(D.nextTooth('feline', 109, 'A'), 409);
  assert.deepEqual(D.route('canine', 'B').slice(0, 3), [201, 202, 203]);
  assert.equal(D.nextTooth('canine', 210, 'B'), 311);
  assert.equal(D.prevTooth('canine', 102, 'A'), 101);
});
