import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const F = createRequire(import.meta.url)('../flag-link.js');
const ok = (j, sent) => async (o) => { if (sent) sent.push(JSON.parse(o.body)); return { ok: true, json: async () => j }; };

test('check sends the IDs and returns the open flags; an unreachable dashboard is null, never "no flags"', async () => {
  const sent = [];
  const flags = await F.check(['A1', ' a2 ', ''], ok({ ok: true, flags: [{ title: 'A1', problem: 'vomiting' }] }, sent));
  assert.deepEqual(sent[0], { flag_check: { titles: ['A1', 'a2'] } });
  assert.deepEqual(flags, [{ title: 'A1', problem: 'vomiting' }]);
  assert.equal(await F.check(['A1'], async () => null), null);
  assert.equal(await F.check(['A1'], async () => ({ ok: false, json: async () => ({ error: 'nope' }) })), null);
  assert.equal(F.lastError(), 'nope');
  assert.equal(await F.check(['A1'], async () => { throw new Error('offline'); }), null);
  assert.equal(await F.check([], ok({})), null);
});
test('done returns the counts only when the dashboard confirms', async () => {
  const sent = [];
  const r = await F.done('A1', ' Eating well ', ok({ ok: true, updated: 1, found: 1, waiting_medication: 0 }, sent));
  assert.deepEqual(sent[0], { flag_done: { title: 'A1', plan: 'Eating well' } });
  assert.equal(r.updated, 1);
  assert.equal(await F.done('A1', 'x', async () => ({ ok: true, json: async () => ({}) })), null, 'a reply without ok:true is not a confirmation');
});
test('key ignores case and spaces', () => assert.equal(F.key(' a 12 3'), 'A123'));
