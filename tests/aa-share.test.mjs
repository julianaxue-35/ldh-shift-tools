import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../aa-share.js');

const reg = (extra = {}) => Object.assign({ id: 'x1', animalId: 'T-100', location: 'Pound 1', registered: true }, extra);
const noteOf = a => a.note || 'note';

test('sig is stable and changes with the text', () => {
  assert.equal(A.sig('abc'), A.sig('abc'));
  assert.notEqual(A.sig('abc'), A.sig('abd'));
  assert.equal(typeof A.sig(undefined), 'string');
});
test('status: not registered -> na; no ID -> noid; never confirmed -> notsent; edited since -> stale; matching -> sent', () => {
  assert.equal(A.status(reg({ registered: false }), 'note'), 'na');
  assert.equal(A.status(reg({ animalId: '  ' }), 'note'), 'noid');
  assert.equal(A.status(reg(), 'note'), 'notsent');
  assert.equal(A.status(reg({ aaSentAt: '2026-10-18T01:00:00Z', aaSig: A.sig('note') }), 'note'), 'sent');
  assert.equal(A.status(reg({ aaSentAt: '2026-10-18T01:00:00Z', aaSig: A.sig('old note') }), 'note'), 'stale');
});
test('summary counts only registered animals; unsent = notsent + stale + noid', () => {
  const animals = [reg({ id: 'a', aaSentAt: 'x', aaSig: A.sig('note') }), reg({ id: 'b' }), reg({ id: 'c', animalId: '' }),
    reg({ id: 'd', registered: false }), reg({ id: 'e', aaSentAt: 'x', aaSig: 'old' })];
  assert.deepEqual(A.summary(animals, noteOf), { sent: 1, notsent: 1, stale: 1, noid: 1, unsent: 3 });
});
test('needsSend returns only sendable animals (registered, has ID, not sent or stale)', () => {
  const animals = [reg({ id: 'a', aaSentAt: 'x', aaSig: A.sig('note') }), reg({ id: 'b' }), reg({ id: 'c', animalId: '' }), reg({ id: 'e', aaSentAt: 'x', aaSig: 'old' })];
  assert.deepEqual(A.needsSend(animals, noteOf).map(a => a.id), ['b', 'e']);
});
test('buildBody makes the aa request; no ID gives null', () => {
  const b = A.buildBody({ kind: 'processing_note', animal: reg(), noteText: 'Exam normal.', docxB64: 'UEsDBA==', sentBy: 'ab' });
  assert.deepEqual(b, { aa: { kind: 'processing_note', animal_id: 'T-100', location: 'Pound 1', sent_by: 'ab', payload: { text: 'Exam normal.', docx_b64: 'UEsDBA==' } } });
  assert.equal(A.buildBody({ kind: 'processing_note', animal: reg({ animalId: '' }), noteText: 'x' }), null);
  assert.equal('docx_b64' in A.buildBody({ kind: 'processing_note', animal: reg(), noteText: 'x', docxB64: '' }).aa.payload, false);
});
test('send is true only for ok + {ok:true}; every failure is false and never throws', async () => {
  const body = { aa: {} };
  const reply = (ok, json) => async () => ({ ok, json: async () => json });
  assert.equal(await A.send(body, reply(true, { ok: true })), true);
  assert.equal(await A.send(body, reply(true, { ok: false })), false);
  assert.equal(await A.send(body, reply(true, {})), false);
  assert.equal(await A.send(body, reply(false, { ok: true })), false);
  assert.equal(await A.send(body, async () => { throw new Error('offline'); }), false);
  assert.equal(await A.send(body, async () => ({ ok: true, json: async () => { throw new Error('not json'); } })), false);
  assert.equal(await A.send(body, async () => null), false);
});
test('switch is off by default, remembered per tool, and a broken storage reads as off', () => {
  const mem = {}; const storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };
  assert.equal(A.isOn('processing', storage), false);
  A.setOn('processing', true, storage);
  assert.equal(A.isOn('processing', storage), true);
  assert.equal(A.isOn('sick_injured', storage), false);
  A.setOn('processing', false, storage);
  assert.equal(A.isOn('processing', storage), false);
  assert.equal(A.isOn('processing', { getItem() { throw new Error('blocked'); } }), false);
});

test('normalize drops the Date/Vet/Nurse line and the signature initials, so changing initials is not an edit', () => {
  const note = (vet, nurse, date) => `Date: ${date}    Vet: ${vet}    Nurse: ${nurse}\nExam normal.\nWeight 12 kg.\n${vet}`;
  const a = A.normalize(note('JX', 'AB', '18 Oct 2026'), ['JX', 'AB']);
  const b = A.normalize(note('KL', 'CD', '19 Oct 2026'), ['KL', 'CD']);
  assert.equal(a, b);
  assert.notEqual(a, A.normalize(note('JX', 'AB', '18 Oct 2026').replace('12 kg', '13 kg'), ['JX', 'AB']));
  assert.equal(A.normalize('plain', []), 'plain');
  assert.equal(A.normalize(undefined, null), '');
});
test('send keeps the server reason for a refusal in lastError', async () => {
  await A.send({ aa: {} }, async () => ({ ok: false, json: async () => ({ error: 'The note is too long (limit 20,000 characters).' }) }));
  assert.match(A.lastError(), /too long/);
  await A.send({ aa: {} }, async () => ({ ok: true, json: async () => ({ ok: true }) }));
  assert.equal(A.lastError(), '');
  await A.send({ aa: {} }, async () => { throw new Error('offline'); });
  assert.match(A.lastError(), /connect|offline/i);
});
