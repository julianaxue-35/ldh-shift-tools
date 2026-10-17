/* LDH Shift Tools: dashboard sync code (2026-10-17 security fix).
   The sync secret used to be written into the page source, so anyone who
   viewed the source could add, complete or delete dashboard tasks. The sync
   code is now the LDH access code itself: the access gate remembers it on
   this phone after a correct entry. The Edge Function's SYNC_SECRET must be
   set to the same LDH code. If it is ever changed, the next sync gets
   "401 Unauthorized", the stored code is forgotten, and the phone asks for
   the LDH code again (here, or at the gate on next page load).
   Loaded before medchart.js and each tool's own script. */
(function () {
  var ENDPOINT = 'https://yeazfafvylawwgoxlhbl.supabase.co/functions/v1/clever-endpoint';
  var APIKEY = 'sb_publishable_fow5B_VGO3gKPf4BaULsOQ_ZiSH8q8Y'; // publishable key: safe to be public
  var LS_KEY = 'ldh_sync_code_v1';

  function getCode() {
    try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
  }
  function setCode(v) {
    try {
      if (v) localStorage.setItem(LS_KEY, v); else localStorage.removeItem(LS_KEY);
    } catch (e) { /* storage blocked: the phone will just ask again */ }
  }

  /* Small bar at the bottom of the page: "Dashboard not connected". Shown
     only when a sync is attempted without a working code, so the tool still
     works fully offline without nagging. */
  var bar = null;
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function showBar(wrong) {
    if (!document.body) return;
    hideBar();
    bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:460px;margin:0 auto;' +
      'background:#2b2140;color:#fff;border-radius:10px;padding:10px 12px;font:14px/1.35 system-ui,sans-serif;' +
      'display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.25)';
    var msg = document.createElement('span');
    msg.style.flex = '1';
    msg.textContent = wrong
      ? 'The LDH code has changed. Re-enter it to reconnect the dashboard. Notes are still saved on this phone.'
      : 'Dashboard not connected on this phone. Notes are still saved here.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Connect';
    btn.style.cssText = 'background:#e8b931;color:#2b2140;border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer';
    btn.onclick = function () {
      var v = window.prompt('Enter the LDH access code:', '');
      if (v && v.trim()) { setCode(v.trim()); hideBar(); }
    };
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '×';
    x.style.cssText = 'background:none;border:0;color:#fff;font-size:20px;cursor:pointer;padding:0 4px';
    x.onclick = hideBar;
    bar.appendChild(msg); bar.appendChild(btn); bar.appendChild(x);
    document.body.appendChild(bar);
  }

  function headers() {
    return { apikey: APIKEY, 'x-sync-secret': getCode(), 'Content-Type': 'application/json' };
  }

  /* Drop-in for fetch(ENDPOINT, opts). Rejects (so existing .catch/try
     blocks handle it as "offline") when no code is stored yet. */
  function syncFetch(opts) {
    if (!getCode()) { showBar(false); return Promise.reject(new Error('No sync code on this phone')); }
    opts = opts || {};
    opts.headers = headers();
    return fetch(ENDPOINT, opts).then(function (res) {
      if (res.status === 401) { setCode(''); showBar(true); }
      return res;
    });
  }

  window.LDHSync = { fetch: syncFetch, getCode: getCode, setCode: setCode, connect: function () { showBar(false); } };
})();
