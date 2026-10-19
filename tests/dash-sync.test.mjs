import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const D = createRequire(import.meta.url)('../dash-sync.js');
const sent = [];
D._setFetcher(async (o) => { sent.push(JSON.parse(o.body)); return { ok: true }; });
const reset = () => { sent.length = 0; };

test('an animal with only an ID is sent under the placeholder location', async () => {
  reset();
  const a = { animalId: ' 1170123 ', location: '' };
  await D.complete(a, 'processing');
  assert.deepEqual(sent[0], { title: '1170123', location: 'Location TBC', shift: 'processing' });
  assert.equal(a.dashTitle, '1170123'); assert.equal(a.dashLoc, 'Location TBC');
  reset(); await D.addToList([{ animalId: 'X1', location: 'Pound 1' }, { animalId: '', location: 'Pound 2' }], 'processing');
  assert.deepEqual(sent[0], { items: [{ title: 'X1', location: 'Pound 1', shift: 'processing' }] }, 'blank IDs are never sent');
});

test('editing the location moves the case: old one deleted, new one added (completed if registered)', async () => {
  reset();
  const a = { animalId: 'A1', location: '', registered: true, dashTitle: 'A1', dashLoc: 'Location TBC' };
  a.location = 'Pound 1';
  await D.rekey(a, 'sick_injured');
  assert.deepEqual(sent.find(b => b.delete), { delete: { title: 'A1', location: 'Location TBC', shift: 'sick_injured' } });
  assert.deepEqual(sent.find(b => b.title), { title: 'A1', location: 'Pound 1', shift: 'sick_injured' });
  assert.equal(a.dashLoc, 'Pound 1');
  reset(); await D.rekey(a, 'sick_injured');
  assert.equal(sent.length, 0, 'nothing is re-sent when the key has not changed');
});

test('an unregistered animal is re-added to the list, not completed; first ID entered on a manual add is added', async () => {
  reset();
  const a = { animalId: 'B1', location: 'Pound 2', registered: false, dashTitle: 'B0', dashLoc: 'Pound 2' };
  await D.rekey(a, 'processing');
  assert.deepEqual(sent.find(b => b.items), { items: [{ title: 'B1', location: 'Pound 2', shift: 'processing' }] });
  reset();
  const m = { animalId: 'M1', location: '' };
  await D.rekey(m, 'processing');
  assert.deepEqual(sent, [{ items: [{ title: 'M1', location: 'Location TBC', shift: 'processing' }] }], 'a manual add with just an ID appears on the dashboard');
});

test('clearing the ID removes the case; keepOld stops a shared case being deleted; a later edit is picked up', async () => {
  reset();
  const a = { animalId: '', location: 'Pound 1', dashTitle: 'C1', dashLoc: 'Pound 1' };
  await D.rekey(a, 'processing');
  assert.deepEqual(sent, [{ delete: { title: 'C1', location: 'Pound 1', shift: 'processing' } }]);
  assert.equal(a.dashTitle, '');
  reset();
  const b = { animalId: 'C2', location: 'Pound 3', dashTitle: 'C2', dashLoc: 'Pound 1' };
  await D.rekey(b, 'sick_injured', { keepOld: (t, l) => t === 'C2' && l === 'Pound 1' });
  assert.ok(!sent.some(x => x.delete), 'another visit still owns the old case');
  reset();
  await D.rekey({ animalId: 'Z', location: 'P', dashTitle: 'Z', dashLoc: 'P', dashConfirmed: true }, 'processing');
  assert.equal(sent.length, 0, 'nothing changed, nothing sent');
});

test('Clear list takes only the unfinished animals off the dashboard', async () => {
  reset();
  await D.removeUnfinished([
    { animalId: 'D1', location: 'P1', registered: false, dashTitle: 'D1', dashLoc: 'P1' },
    { animalId: 'D2', location: 'P1', registered: true, dashTitle: 'D2', dashLoc: 'P1' },
    { animalId: 'D3', location: '', registered: false },
    { animalId: '', location: 'P1', registered: false }
  ], 'processing');
  assert.deepEqual(sent.map(b => b.delete.title).sort(), ['D1', 'D3']);
  assert.equal(sent.find(b => b.delete.title === 'D3').delete.location, 'Location TBC');
});

test('catchUp sends only what the dashboard has never heard about (and completes the registered ones)', async () => {
  reset();
  const animals = [
    { animalId: 'N1', location: '', registered: false },                                   // added by hand, never sent
    { animalId: 'N2', location: '', registered: true },                                    // registered before it had a location
    { animalId: 'K1', location: 'P1', registered: true, dashTitle: 'K1', dashLoc: 'P1', dashConfirmed: true },  // already confirmed
    { animalId: 'E1', location: 'P1', registered: false, doneElsewhere: true },
    { animalId: '', location: 'P1', registered: false }
  ];
  const n = await D.catchUp(animals, 'processing');
  assert.equal(n, 2);
  assert.deepEqual(sent.find(b => b.items).items.map(i => i.title).sort(), ['N1', 'N2']);
  assert.ok(sent.find(b => b.items).items.every(i => i.location === 'Location TBC'));
  assert.deepEqual(sent.filter(b => b.title).map(b => b.title), ['N2'], 'only the registered one is completed');
  assert.equal(animals[0].dashTitle, 'N1', 'remembered, so it is not sent again');
  assert.equal(animals[0].dashConfirmed, true);
  reset(); assert.equal(await D.catchUp(animals, 'processing'), 0); assert.equal(sent.length, 0);
});

test('an animal only counts as sent once the dashboard confirmed; a lost send is retried by the next catch-up', async () => {
  const list = [{ animalId: 'R1', location: 'P1' }, { animalId: 'R2', location: 'P1' }];
  D._setFetcher(async () => { throw new Error('offline'); });
  assert.equal(await D.catchUp(list, 'sick_injured'), 2);
  assert.ok(!list[0].dashConfirmed && !list[0].dashTitle, 'a failed send is not remembered');
  D._setFetcher(async () => ({ ok: false, status: 500 }));
  await D.catchUp(list, 'sick_injured');
  assert.ok(!list[1].dashConfirmed, 'an error answer is not remembered either');
  D._setFetcher(async (o) => { sent.push(JSON.parse(o.body)); return { ok: true }; });
  reset();
  assert.equal(await D.catchUp(list, 'sick_injured'), 2);
  assert.deepEqual(sent[0].items.map(i => i.title), ['R1', 'R2']);
  assert.ok(list.every(a => a.dashConfirmed));
  reset(); assert.equal(await D.catchUp(list, 'sick_injured'), 0);
});
test('animals marked as sent by an older version (never confirmed) are sent once more; the old kept-off flag no longer hides anything', async () => {
  reset();
  const list = [{ animalId: 'L1', location: 'P1', dashTitle: 'L1', dashLoc: 'P1' }, { animalId: 'L2', location: 'P1', dashOff: true }];
  assert.equal(await D.catchUp(list, 'sick_injured'), 2);
  assert.deepEqual(sent[0].items.map(i => i.title).sort(), ['L1', 'L2']);
});
test('an edited ID/location that failed to send is retried, removing the old case', async () => {
  reset();
  const a = { animalId: 'M9', location: 'P2', dashTitle: 'M9', dashLoc: 'P1', dashConfirmed: true };
  await D.catchUp([a], 'processing');
  assert.deepEqual(sent.find(b => b.delete), { delete: { title: 'M9', location: 'P1', shift: 'processing' } });
  assert.ok(sent.some(b => b.items && b.items[0].location === 'P2'));
  assert.equal(a.dashLoc, 'P2');
});
