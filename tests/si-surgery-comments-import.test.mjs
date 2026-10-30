// Sick & Injured: Vet Reminder Report import prefers the Surgery Comments column (no word limit) over Reminder (500).
// Pulls the real functions out of sick-injured.html. Fictional animals only.   node --test tests/si-surgery-comments-import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sick-injured.html'), 'utf8');
const a = html.indexOf('const SC_CONSULT_RE'), b = html.indexOf('/* Room picker for the import preview');
const P = new Function("const normHeader=v=>(v==null?'':String(v)).replace(/\\s+/g,' ').trim().toLowerCase();" +
  "const normaliseRoomToken=x=>String(x).trim();" + html.slice(a, b) + '; return {parseVetReminderReport, latestConsultBlock, isConsultNote};')();

const HDR = ['Edit Consult','Reminder Date',null,'Reminder',null,null,'Animal Name','Animal ID','Shelter / Kennel',null,'Breed','Status','Gender','Weight',null,null,null,'Surgery Comments'];
const row = (id, rem, sc) => { const r = new Array(18).fill(null); r[0]='Edit Consult'; r[7]=id; r[8]='Cat Room 1 / 08'; r[3]=rem; r[17]=sc; return r; };
const FULL = `Date: 20/10/2026
Reason / History:
Long running history that is well over the old limit.
Assessment: 1. FURI
Treatment / Fees: Doxy 10mg/kg PO BID`;

test('Surgery Comments consult note is the note; the Reminder is kept as reference only', () => {
  const out = P.parseVetReminderReport([HDR, row('100', 'short trimmed reminder', FULL)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].noteText, FULL);
  assert.deepEqual(out[0].otherReminders, ['Reminder:\nshort trimmed reminder']);
});

test('no Surgery Comments -> Reminder is used exactly as before', () => {
  const out = P.parseVetReminderReport([HDR, row('101', FULL, null)]);
  assert.equal(out.length, 1); assert.equal(out[0].noteText, FULL); assert.deepEqual(out[0].otherReminders, []);
});

test('Surgery Comments that is not a consult note (e.g. a question) does not replace the Reminder', () => {
  const out = P.parseVetReminderReport([HDR, row('102', FULL, 'how do i see the surgery comments? ')]);
  assert.equal(out[0].noteText, FULL);
  assert.deepEqual(out[0].otherReminders, ['Surgery Comments:\nhow do i see the surgery comments?']);
});

test('report without the column still imports', () => {
  const h = HDR.slice(0, 17), r = row('103', FULL, null).slice(0, 17);
  assert.equal(P.parseVetReminderReport([h, r])[0].noteText, FULL);
});

test('several dated consults in one cell: the most recent is parsed, the whole text stays as reference', () => {
  const cell = `Date: 5/10/2026\nReason / History: old\nAssessment: A\n\nDate: 20/10/2026\nReason / History: newer\nAssessment: B\n\nDate: 12/10/2026\nReason / History: middle\nAssessment: C`;
  assert.match(P.latestConsultBlock(cell), /^Date: 20\/10\/2026[\s\S]*newer[\s\S]*Assessment: B$/);
  assert.ok(!/middle/.test(P.latestConsultBlock(cell)));
  const out = P.parseVetReminderReport([HDR, row('104', null, cell)]);
  assert.match(out[0].noteText, /newer/); assert.equal(out[0].otherReminders[0], 'Full history (Surgery Comments):\n' + cell);
});
