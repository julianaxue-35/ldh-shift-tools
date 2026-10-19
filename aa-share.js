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
  // The note text without the parts that change for reasons that are not an edit: the Date/Vet/Nurse line and the
  // closing initials. Changing the nurse at lunch, or crossing midnight, must not make every sent note look edited.
  function normalize(text, strip) {
    var drop = (strip || []).map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
    return String(text == null ? '' : text).split('\n').filter(function (line, i) {
      var t = line.trim();
      if (/^Date: .*Vet: .*Nurse: /.test(t) || (i === 0 && /^Date: /.test(t))) return false;
      return drop.indexOf(t) === -1;
    }).join('\n');
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
    if (o.priority === true) payload.priority = true;       // the vet asked for this one to be done first
    return { aa: { kind: o.kind, animal_id: String(o.animal.animalId).trim(), location: o.animal.location || '', sent_by: o.sentBy || '', payload: payload } };
  }
  var lastErr = '';
  function lastError() { return lastErr; }
  function send(body, fetcher) {
    var f = fetcher || function (opts) { return g.LDHSync.fetch(opts); };
    lastErr = '';
    return Promise.resolve().then(function () { return f({ method: 'POST', body: JSON.stringify(body) }); })
      .then(function (res) {
        if (!res) { lastErr = "Couldn't connect to the dashboard."; return false; }
        return res.json().then(function (j) {
          if (res.ok && j && j.ok === true) return true;
          lastErr = (j && j.error) ? String(j.error) : (res.ok ? 'The dashboard did not confirm it saved.' : 'The dashboard refused it (' + (res.status || 'error') + ').');
          return false;
        }, function () { lastErr = res.ok ? 'The dashboard did not confirm it saved.' : "Couldn't connect to the dashboard."; return false; });
      })
      .catch(function () { lastErr = "Couldn't connect to the dashboard (offline?)."; return false; });
  }
  // ---- "Entered in ShelterMate" read-back ----
  // The AA's tick deletes the card, so the dashboard answers "which of these cards are still waiting?" and anything
  // we sent that is no longer waiting has been entered. Anything that cannot be confirmed (offline, error) leaves
  // the status exactly as it was.
  function pairKey(kind, id) { return kind + '|' + String(id == null ? '' : id).trim().toUpperCase(); }
  function check(pairs, fetcher) {
    var f = fetcher || function (opts) { return g.LDHSync.fetch(opts); };
    var items = (pairs || []).filter(function (p) { return p && p.kind && String(p.animal_id || '').trim(); });
    if (!items.length) return Promise.resolve(null);
    return Promise.resolve().then(function () { return f({ method: 'POST', body: JSON.stringify({ aa_check: { items: items } }) }); })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json().then(function (j) {
          if (!j || j.ok !== true || !Array.isArray(j.pending)) return null;
          var set = {}; j.pending.forEach(function (k) { set[k] = true; }); return set;
        }, function () { return null; });
      }).catch(function () { return null; });
  }
  // Marks each sent item entered (no longer waiting) or, if its card has reappeared, waiting again. Returns how many changed.
  function applyCheck(list, kind, pending, nowISO, idOf) {
    var n = 0;
    list.forEach(function (x) {
      if (!x.aaSentAt) return;
      var waiting = !!pending[pairKey(kind, (idOf ? idOf(x) : (x.aaSentId || x.animalId)))];
      if (!waiting && !x.aaEnteredAt) { x.aaEnteredAt = nowISO; n++; }
      else if (waiting && x.aaEnteredAt) { x.aaEnteredAt = ''; n++; }
    });
    return n;
  }
  // The label shown on an animal: what the vet most needs to know about where it has got to.
  function badge(a, noteText) {
    var st = status(a, noteText);
    if (st === 'na') return '';
    if (st === 'noid') return 'No ID';
    if (st === 'notsent' || st === 'stale') return 'NOT SENT';
    return a.aaEnteredAt ? 'Entered in ShelterMate' : 'Sent to AA';
  }
  function store(storage) { if (storage) return storage; try { return g.localStorage; } catch (e) { return null; } }
  function isOn(tool, storage) {
    try { var s = store(storage); return !!s && s.getItem(KEY_PREFIX + tool) === '1'; } catch (e) { return false; }
  }
  function setOn(tool, on, storage) {
    try { var s = store(storage); if (!s) return; if (on) s.setItem(KEY_PREFIX + tool, '1'); else s.removeItem(KEY_PREFIX + tool); } catch (e) { /* storage blocked: switch stays off */ }
  }
  return { normalize: normalize, lastError: lastError, sig: sig, status: status, summary: summary, needsSend: needsSend, buildBody: buildBody, send: send, check: check, applyCheck: applyCheck, pairKey: pairKey, badge: badge, isOn: isOn, setOn: setOn };
});
