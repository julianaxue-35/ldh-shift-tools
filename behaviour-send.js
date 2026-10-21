/* LDH Shift Tools: send an animal to the Behaviour page with its whole note attached (2026-10-21).
   Same confirmed-send rule as Admission AA: it only counts as sent when the dashboard replies HTTP 200 {"ok":true}.
   The database deletes the attached note when Behaviour ticks Done (or after 7 days). Nothing is queued in the background. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis, require('./aa-share.js'));
  else root.BehaviourSend = factory(root, root.AAShare);
})(typeof self !== 'undefined' ? self : this, function (g, AAShare) {
  var WINDOWS = ['30_60m', 'today', '48h'];
  function send(body, fetcher) { return AAShare.send(body, fetcher); }
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

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // The button each tool puts on an animal's card. data-bh = the animal's id in that tool.
  function buttonHtml(a, noteText) {
    var st = status(a, noteText), noId = !hasId(a);
    var label = st === 'sent' ? 'Sent to Behaviour \u2713' : st === 'stale' ? 'Edited \u2014 resend to Behaviour' : 'Send to Behaviour';
    var warn = a && a.bhErr ? '<span class="bh-err" style="color:#a33;font-size:11px;margin-left:4px">NOT SENT: ' + esc(a.bhErr) + '</span>' : '';
    return '<button class="btn small secondary bh-send" data-bh="' + esc(a && a.id) + '"' + (noId ? ' disabled title="Add the animal ID first"' : '') + '>' + label + '</button>' + warn;
  }
  // The small window: reason, time frame, initials. onDone(a) runs after a CONFIRMED send (the tool saves + redraws).
  function open(a, o) {
    var doc = g.document; if (!doc || !hasId(a)) return;
    var wrap = doc.createElement('div'); wrap.className = 'bh-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px');
    wrap.innerHTML = '<div role="dialog" aria-modal="true" style="background:var(--card,#fff);color:var(--ink,#222);border-radius:12px;max-width:440px;width:100%;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.3)">' +
      '<h3 style="margin:0 0 6px">Send ' + esc(String(a.animalId).trim()) + ' to Behaviour</h3>' +
      '<p style="font-size:12px;margin:0 0 10px;opacity:.8">The whole note goes with it so the team can read it. It is deleted from the database when Behaviour ticks Done.</p>' +
      '<label style="font-size:12px">Why? (required)</label><textarea class="bh-reason" rows="3" style="width:100%;box-sizing:border-box;margin:2px 0 8px"></textarea>' +
      '<label style="font-size:12px">Time frame</label><select class="bh-window" style="width:100%;margin:2px 0 8px"><option value="30_60m">30\u201360 minutes</option><option value="today" selected>Within today</option><option value="48h">Within 48 hours</option></select>' +
      '<label style="font-size:12px">Your initials (required)</label><input class="bh-init" maxlength="4" style="width:80px;margin:2px 0 8px;text-transform:uppercase">' +
      '<div class="bh-msg" style="color:#a33;font-size:12px;min-height:16px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="btn secondary bh-cancel">Cancel</button><button class="btn bh-go">Send</button></div></div>';
    doc.body.appendChild(wrap);
    var q = function (c) { return wrap.querySelector(c); };
    q('.bh-init').value = String((o.initials && o.initials()) || '').toUpperCase().slice(0, 4);
    q('.bh-cancel').onclick = function () { wrap.remove(); };
    q('.bh-go').onclick = function () {
      var reason = q('.bh-reason').value.trim(), by = q('.bh-init').value.trim();
      if (!reason) { q('.bh-msg').textContent = 'Say why you are sending it.'; return; }
      if (!/^[A-Za-z]{1,4}$/.test(by)) { q('.bh-msg').textContent = 'Enter your initials (1 to 4 letters).'; return; }
      var go = q('.bh-go'); go.disabled = true; go.textContent = 'Sending\u2026';
      var noteText = o.noteText();
      var body = buildBody({ animal: a, noteText: noteText, reason: reason, window: q('.bh-window').value, sentBy: by });
      send(body).then(function (ok) {
        if (ok) { a.bhSentAt = new Date().toISOString(); a.bhSig = AAShare.sig(o.sigText ? o.sigText() : noteText); a.bhErr = ''; wrap.remove(); if (o.onDone) o.onDone(a); }
        else { a.bhErr = AAShare.lastError(); go.disabled = false; go.textContent = 'Resend'; q('.bh-msg').textContent = 'NOT SENT: ' + a.bhErr; if (o.onDone) o.onDone(a); }
      });
    };
  }
  return { buttonHtml: buttonHtml, open: open, buildBody: buildBody, status: status, WINDOWS: WINDOWS, sig: AAShare.sig, send: send, lastError: function () { return AAShare.lastError(); } };
});
