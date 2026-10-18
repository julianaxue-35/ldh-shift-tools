/* LDH Shift Tools: share finished notes with the Admission AA page (2026-10-18).
   Shared by the tools (Processing now; Sick & Injured and medication charts later). The page-specific wiring lives
   in each tool; everything here is plain, testable logic. A send only counts as sent when the dashboard's Edge
   Function replies HTTP 200 with {"ok":true} — anything else is "not sent" and the vet is shown a Resend button.
   Nothing is queued in the background. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.AAShare = factory(root);
})(typeof self !== 'undefined' ? self : this, function (g) {
  var KEY_PREFIX = 'ldh_aa_share_';

  function sig(text) {
    var s = String(text == null ? '' : text), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return s.length + ':' + h.toString(36);
  }
  function hasId(a) { return !!(a && String(a.animalId == null ? '' : a.animalId).trim()); }
  function status(a, noteText) {
    if (!a || !a.registered) return 'na';
    if (!hasId(a)) return 'noid';
    if (!a.aaSentAt) return 'notsent';
    return a.aaSig === sig(noteText) ? 'sent' : 'stale';
  }
  function summary(animals, noteOf) {
    var s = { sent: 0, notsent: 0, stale: 0, noid: 0, unsent: 0 };
    animals.forEach(function (a) {
      var st = status(a, a && a.registered ? noteOf(a) : '');
      if (st in s) { s[st]++; if (st !== 'sent') s.unsent++; }
    });
    return s;
  }
  function needsSend(animals, noteOf) {
    return animals.filter(function (a) { var st = status(a, a && a.registered ? noteOf(a) : ''); return st === 'notsent' || st === 'stale'; });
  }
  function buildBody(o) {
    if (!hasId(o.animal)) return null;
    var payload = { text: String(o.noteText == null ? '' : o.noteText) };
    if (o.docxB64) payload.docx_b64 = o.docxB64;
    return { aa: { kind: o.kind, animal_id: String(o.animal.animalId).trim(), location: o.animal.location || '', sent_by: o.sentBy || '', payload: payload } };
  }
  function send(body, fetcher) {
    var f = fetcher || function (opts) { return g.LDHSync.fetch(opts); };
    return Promise.resolve().then(function () { return f({ method: 'POST', body: JSON.stringify(body) }); })
      .then(function (res) { if (!res || !res.ok) return false; return res.json().then(function (j) { return !!(j && j.ok === true); }); })
      .catch(function () { return false; });
  }
  function store(storage) { if (storage) return storage; try { return g.localStorage; } catch (e) { return null; } }
  function isOn(tool, storage) {
    try { var s = store(storage); return !!s && s.getItem(KEY_PREFIX + tool) === '1'; } catch (e) { return false; }
  }
  function setOn(tool, on, storage) {
    try { var s = store(storage); if (!s) return; if (on) s.setItem(KEY_PREFIX + tool, '1'); else s.removeItem(KEY_PREFIX + tool); } catch (e) { /* storage blocked: switch stays off */ }
  }
  return { sig: sig, status: status, summary: summary, needsSend: needsSend, buildBody: buildBody, send: send, isOn: isOn, setOn: setOn };
});
