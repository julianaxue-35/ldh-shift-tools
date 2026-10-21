import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const B = createRequire(import.meta.url)('../behaviour-send.js');

const a = (x = {}) => Object.assign({ animalId: ' BEH-1 ', location: 'Cat Room 1 / 3' }, x);

test('buildBody makes the behaviour request with the whole note; no ID gives null', () => {
  const body = B.buildBody({ animal: a(), noteText: 'Whole note\n"quoted" 😀', reason: ' Hissing ', window: '48h', sentBy: 'ab' });
  assert.deepEqual(body, { behaviour: { animal_id: 'BEH-1', location: 'Cat Room 1 / 3', reason: 'Hissing', sent_by: 'ab', window: '48h', note: 'Whole note\n"quoted" 😀', species: '' } });
  assert.equal(B.buildBody({ animal: a({ animalId: '  ' }), noteText: 'x', reason: 'r', sentBy: 'AB' }), null);
});
test('an unknown time frame falls back to today', () => {
  assert.equal(B.buildBody({ animal: a(), noteText: 'x', reason: 'r', window: 'soon', sentBy: 'AB' }).behaviour.window, 'today');
});
test('a 20,000-character note is sent whole', () => {
  assert.equal(B.buildBody({ animal: a(), noteText: 'x'.repeat(20000), reason: 'r', sentBy: 'AB' }).behaviour.note.length, 20000);
});
test('status: none until a send is confirmed; sent while the note is unchanged; stale once edited', () => {
  assert.equal(B.status(a(), 'note'), 'none');
  assert.equal(B.status(a({ bhSentAt: 'x', bhSig: B.sig('note') }), 'note'), 'sent');
  assert.equal(B.status(a({ bhSentAt: 'x', bhSig: B.sig('old') }), 'note'), 'stale');
});
test('send: only HTTP 200 {ok:true} counts; anything else is not sent with a reason', async () => {
  const res = (ok, status, j) => ({ ok, status, json: async () => j });
  assert.equal(await B.send({ behaviour: {} }, async () => res(true, 200, { ok: true })), true);
  assert.equal(await B.send({ behaviour: {} }, async () => res(false, 400, { error: 'A reason is required.' })), false);
  assert.equal(B.lastError(), 'A reason is required.');
  assert.equal(await B.send({ behaviour: {} }, async () => res(true, 200, { ok: false })), false);
  assert.equal(await B.send({ behaviour: {} }, async () => { throw new Error('offline'); }), false);
  assert.match(B.lastError(), /offline|connect/i);
});

test('microchip numbers never go: the Microchip line and any 15-digit number are removed', () => {
  const note = 'Exam normal\nMicrochip: 900123456789012\n  microchip number 123456789\nScanned chip 900123456789012 again\nMicrochip: none found';
  const out = B.buildBody({ animal: a(), noteText: note, reason: 'r', sentBy: 'AB' }).behaviour.note;
  assert.ok(!/\d{9}/.test(out), out);
  assert.match(out, /Exam normal/); assert.match(out, /Microchip: none found/); assert.match(out, /Scanned chip \[number removed\] again/);
});
test('the animal\'s species (cat or dog) travels with the request', () => {
  assert.equal(B.buildBody({ animal: a({ species: 'cat' }), noteText: 'x', reason: 'r', sentBy: 'AB' }).behaviour.species, 'cat');
  assert.equal(B.buildBody({ animal: a({ species: 'rabbit' }), noteText: 'x', reason: 'r', sentBy: 'AB' }).behaviour.species, '');
});
