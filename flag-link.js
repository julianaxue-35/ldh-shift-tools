/* LDH Shift Tools: link a Processing animal to its flag on the dashboard (2026-10-19).
   check(titles)  -> the OPEN staff requests on those animals (or null when the dashboard can't be reached)
   done(title, plan) -> marks them done with a quick plan; resolves {updated, found, waiting_medication} or null.
   Nothing is queued: if it can't be confirmed, the vet is told and tries again. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.FlagLink = factory(root);
})(typeof self !== 'undefined' ? self : this, function (g) {
  var lastErr = '';
  function key(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase(); }
  function call(body, fetcher) {
    var f = fetcher || function (o) { return g.LDHSync.fetch(o); };
    lastErr = '';
    return Promise.resolve().then(function () { return f({ method: 'POST', body: JSON.stringify(body) }); }).then(function (res) {
      if (!res) { lastErr = "Couldn't connect to the dashboard."; return null; }
      return res.json().then(function (j) {
        if (res.ok && j && j.ok === true) return j;
        lastErr = (j && j.error) ? String(j.error) : 'The dashboard did not confirm it.';
        return null;
      }, function () { lastErr = "Couldn't read the dashboard's reply."; return null; });
    }).catch(function () { lastErr = "Couldn't connect to the dashboard (offline?)."; return null; });
  }
  function check(titles, fetcher) {
    var t = (titles || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (!t.length) return Promise.resolve(null);
    return call({ flag_check: { titles: t.slice(0, 100) } }, fetcher).then(function (j) { return j ? (j.flags || []) : null; });
  }
  function done(title, plan, fetcher) {
    return call({ flag_done: { title: String(title || '').trim(), plan: String(plan || '').trim() } }, fetcher);
  }
  return { key: key, check: check, done: done, lastError: function () { return lastErr; } };
});
