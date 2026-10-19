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
  function post(body) {
    var f = fetcher || function (o) { return g.LDHSync.fetch(o); };
    try { return Promise.resolve(f({ method: 'POST', body: JSON.stringify(body) })).catch(function () {}); } catch (e) { return Promise.resolve(); }
  }
  function remember(a) { a.dashTitle = title(a); a.dashLoc = loc(a); }
  // Add animals to the dashboard's list (insert-only there: it never un-completes anything).
  function addToList(animals, shift) {
    var items = (animals || []).filter(function (a) { return title(a); })
      .map(function (a) { remember(a); return { title: title(a), location: loc(a), shift: shift }; });
    if (!items.length) return Promise.resolve();
    return post({ items: items });
  }
  function complete(a, shift, note) {
    if (!title(a)) return Promise.resolve();
    remember(a);
    return post({ title: title(a), location: loc(a), shift: shift, note: note || undefined });
  }
  // Remove the case the dashboard holds for this animal: under the key last sent if known, else the current one.
  function remove(a, shift) {
    var t = a && a.dashTitle ? a.dashTitle : title(a), l = a && a.dashTitle ? a.dashLoc : loc(a);
    if (!t) return Promise.resolve();
    return post({ 'delete': { title: t, location: l, shift: shift } });
  }
  // After the ID or location was edited. keepOld(title, loc) lets a tool say another record still owns the old case.
  function rekey(a, shift, opts) {
    opts = opts || {};
    if (!a || a.dashOff) return Promise.resolve();            // added with "Also add to the dashboard" switched off
    var t = title(a), l = loc(a);
    var had = a.dashTitle ? { title: a.dashTitle, loc: a.dashLoc } : null;
    if (had && had.title === t && had.loc === l) return Promise.resolve();
    var work = [];
    if (had && !(opts.keepOld && opts.keepOld(had.title, had.loc))) work.push(post({ 'delete': { title: had.title, location: had.loc, shift: shift } }));
    if (!t) { a.dashTitle = ''; a.dashLoc = ''; return Promise.all(work); }
    work.push(a.registered ? complete(a, shift, opts.note ? opts.note(a) : undefined) : addToList([a], shift));
    return Promise.all(work);
  }
  // Clear list: everything not yet registered comes off the dashboard too (registered ones stay as completed).
  function removeUnfinished(animals, shift) {
    return Promise.all((animals || []).filter(function (a) { return !a.registered && !a.doneElsewhere && (a.dashTitle || title(a)); }).map(function (a) { return remove(a, shift); }));
  }
  // Catch-up: animals on today's list that the dashboard has never been told about (added by hand, or registered before they had
  // a location) are sent now, so every animal counts in the dashboard rings. Animals already sent (they remember their key) and
  // ones kept off the dashboard on purpose are left alone.
  function catchUp(animals, shift, noteFn) {
    var todo = (animals || []).filter(function (a) { return title(a) && !a.dashOff && !a.doneElsewhere && !a.dashTitle; });
    if (!todo.length) return Promise.resolve(0);
    var work = [addToList(todo, shift)];
    todo.filter(function (a) { return a.registered; }).forEach(function (a) { work.push(complete(a, shift, noteFn ? noteFn(a) : undefined)); });
    return Promise.all(work).then(function () { return todo.length; });
  }
  return { catchUp: catchUp, NO_LOC: NO_LOC, loc: loc, addToList: addToList, complete: complete, remove: remove, rekey: rekey, removeUnfinished: removeUnfinished, _setFetcher: function (f) { fetcher = f; } };
});
