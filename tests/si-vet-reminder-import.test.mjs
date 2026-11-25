// Sick & Injured: the consult note comes from the Vet Reminder column only (2026-11-25; Surgery Comments is no longer read).
// Pulls the real function out of sick-injured.html. Fictional animals only.   node --test tests/si-vet-reminder-import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sick-injured.html'), 'utf8');
const a = html.indexOf('/* Groups report rows by Animal ID'), b = html.indexOf('/* Room picker for the import preview');
const P = new Function("const normHeader=v=>(v==null?'':String(v)).replace(/\\s+/g,' ').trim().toLowerCase();" +
  "const normaliseRoomToken=x=>String(x).trim();" + html.slice(a, b) + '; return {parseVetReminderReport};')();

const HDR = ['Edit Consult','Reminder Date',null,'Reminder',null,null,'Animal Name','Animal ID','Shelter / Kennel',null,'Breed','Status','Gender','Weight',null,null,null,'Surgery Comments'];
const row = (id, rem, sc) => { const r = new Array(18).fill(null); r[0]='Edit Consult'; r[7]=id; r[8]='Cat Room 1 / 08'; r[3]=rem; r[17]=sc; return r; };
const NEW = 'Date: 25/11/2026\nReason / History:\nToday.\nAssessment: FURI';
const OLD = 'Date: 20/10/2026\nReason / History:\nAn older consult.\nAssessment: old';

test('an older consult left in Surgery Comments does not replace the Vet Reminder', () => {
  const out = P.parseVetReminderReport([HDR, row('100', NEW, OLD)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].noteText, NEW);
  assert.deepEqual(out[0].otherReminders, []);
});

test('report without the column imports, and two different reminders stay two entries', () => {
  const h = HDR.slice(0, 17);
  const out = P.parseVetReminderReport([h, row('101', NEW, null).slice(0, 17), row('101', 'Recheck ears', null).slice(0, 17)]);
  assert.deepEqual(out.map(x => x.noteText), [NEW, 'Recheck ears']);
});
