/* LDH Shift Tools: send an animal to the Behaviour page with its whole note attached (2026-10-21).
   Same confirmed-send rule as Admission AA: it only counts as sent when the dashboard replies HTTP 200 {"ok":true}.
   The database deletes the attached note when Behaviour ticks Done (or after 7 days). Nothing is queued in the background. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis, require('./aa-share.js'));
  else root.BehaviourSend = factory(root, root.AAShare);
})(typeof self !== 'undefined' ? self : this, function (g, AAShare) {
  var WINDOWS = ['30_60m', 'today', '48h'];
  function hasId(a) { return !!(a && String(a.animalId == null ? '' : a.animalId).trim()); }
  function buildBody(o) {
    if (!hasId(o.animal)) return null;
    return { behaviour: {
      animal_id: String(o.animal.animalId).trim(),
      location: o.animal.location || '',
      reason: String(o.reason == null ? '' : o.reason).trim(),
      sent_by: String(o.sentBy == null ? '' : o.sentBy).trim(),
      window: WINDOWS.indexOf(o.window) === -1 ? 'today' : o.window,
      note: String(o.noteText == null ? '' : o.noteText)
    } };
  }
  // 'none' = never sent, 'sent' = sent and unchanged, 'stale' = the note was edited after it was sent
  function status(a, noteText) {
    if (!a || !a.bhSentAt) return 'none';
    return a.bhSig === AAShare.sig(noteText) ? 'sent' : 'stale';
  }
  return { buildBody: buildBody, status: status, WINDOWS: WINDOWS, sig: AAShare.sig, send: AAShare.send, lastError: AAShare.lastError };
});
