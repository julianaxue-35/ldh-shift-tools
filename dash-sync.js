/* LDH Shift Tools: keep the dashboard's list in step with what is on this phone (2026-10-19).
   Used by Processing and Sick & Injured. The dashboard keys a case on animal ID + location + shift, and refuses a
   blank location, so an animal with only an ID is sent under the placeholder "Location TBC" (the same placeholder the
   Surgery tool uses). The key last sent is remembered on the animal (dashTitle / dashLoc) so that when the ID or
   location is edited the OLD case is removed and the new one added: no orphans, no double counting. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.DashSync = factory(root);
})(typeof self !== 'undefined' ? self : this, function (g) {
  var NO_LOC = 'Location TBC';
  function loc(a) { return String((a && a.location) || '').trim() || NO_LOC; }
  function title(a) { return String((a && a.animalId) || '').trim(); }
  var fetcher = null;                       // tests inject one; the pages use LDHSync
  // POST to the dashboard; resolves true only if it took the request (an offline phone or an error answer resolves false)
  function post(body) {
    var f = fetcher || function (o) { return g.LDHSync.fetch(o); };
    try { return Promise.resolve(f({ method: 'POST', body: JSON.stringify(body) })).then(function (r) { return !r || r.ok !== false; }, function () { return false; }); } catch (e) { return Promise.resolve(false); }
  }
  // An animal counts as "on the dashboard" only once the dashboard CONFIRMED it. Until then every catch-up pass tries again,
  // so a send lost to patchy wifi heals by itself (no buttons, nothing for staff to sort out).
  function remember(a) { a.dashTitle = title(a); a.dashLoc = loc(a); a.dashConfirmed = true; }
  function isConfirmed(a) { return !!a.dashConfirmed && a.dashTitle === title(a) && a.dashLoc === loc(a); }
  // Add animals to the dashboard's list (insert-only there: it never un-completes anything).
  function addToList(animals, shift) {
    var list = (animals || []).filter(function (a) { return title(a); });
    if (!list.length) return Promise.resolve(true);
    var items = list.map(function (a) { return { title: title(a), location: loc(a), shift: shift }; });
    return post({ items: items }).then(function (ok) { if (ok) list.forEach(remember); return ok; });
  }
  function complete(a, shift, note) {
    if (!title(a)) return Promise.resolve(true);
    return post({ title: title(a), location: loc(a), shift: shift, note: note || undefined }).then(function (ok) { if (ok) remember(a); return ok; });
  }
  // Remove the case the dashboard holds for this animal: under the key last sent if known, else the current one.
  function remove(a, shift) {
    var t = a && a.dashTitle ? a.dashTitle : title(a), l = a && a.dashTitle ? a.dashLoc : loc(a);
    if (!t) return Promise.resolve(true);
    return post({ 'delete': { title: t, location: l, shift: shift } });
  }
  // After the ID or location was edited. keepOld(title, loc) lets a tool say another record still owns the old case.
  function rekey(a, shift, opts) {
    opts = opts || {};
    if (!a) return Promise.resolve();
    var t = title(a), l = loc(a);
    var had = a.dashTitle ? { title: a.dashTitle, loc: a.dashLoc } : null;
    if (had && had.title === t && had.loc === l && a.dashConfirmed) return Promise.resolve();
    var work = [];
    if (had && !(had.title === t && had.loc === l) && !(opts.keepOld && opts.keepOld(had.title, had.loc))) work.push(post({ 'delete': { title: had.title, location: had.loc, shift: shift } }));
    if (!t) { a.dashTitle = ''; a.dashLoc = ''; a.dashConfirmed = false; return Promise.all(work); }
    work.push(a.registered ? complete(a, shift, opts.note ? opts.note(a) : undefined) : addToList([a], shift));
    return Promise.all(work);
  }
  // Clear list: everything not yet registered comes off the dashboard too (registered ones stay as completed).
  function removeUnfinished(animals, shift) {
    return Promise.all((animals || []).filter(function (a) { return !a.registered && !a.doneElsewhere && (a.dashTitle || title(a)); }).map(function (a) { return remove(a, shift); }));
  }
  // Catch-up: every animal on today's list that the dashboard has not CONFIRMED yet is sent (added by hand, registered before it
  // had a location, a send that never got through, an edited ID or location). Runs when the page opens, when the phone comes back
  // online and every minute, so the dashboard always ends up with the whole list. Safe to repeat. Resolves the number tried.
  function catchUp(animals, shift, noteFn) {
    var todo = (animals || []).filter(function (a) { return title(a) && !a.doneElsewhere && !isConfirmed(a); });
    if (!todo.length) return Promise.resolve(0);
    var fresh = todo.filter(function (a) { return !a.dashTitle || (a.dashTitle === title(a) && a.dashLoc === loc(a)); });
    var moved = todo.filter(function (a) { return fresh.indexOf(a) === -1; });
    var work = [];
    if (fresh.length) work.push(addToList(fresh, shift).then(function (ok) {
      if (!ok) return;
      return Promise.all(fresh.filter(function (a) { return a.registered; }).map(function (a) { return complete(a, shift, noteFn ? noteFn(a) : undefined); }));
    }));
    moved.forEach(function (a) { work.push(rekey(a, shift, { note: noteFn })); });
    return Promise.all(work).then(function () { return todo.length; });
  }
  return { catchUp: catchUp, NO_LOC: NO_LOC, loc: loc, addToList: addToList, complete: complete, remove: remove, rekey: rekey, removeUnfinished: removeUnfinished, isConfirmed: isConfirmed, _setFetcher: function (f) { fetcher = f; } };
});
