/* Pegasus — market ticker strip above the page header.
   Data: public.market_ticker (filled every 15 min by the market-ticker edge function).
   Delayed data for information only. Hidden on workspace/admin pages. */
(function () {
  'use strict';
  if (window.__pegTicker) return; window.__pegTicker = 1;
  var path = location.pathname.replace(/^\/(ar|zh|ru|es|fr)(?=\/|$)/, '') || '/';
  if (/^\/(admin|crm|dashboard|deal-room|messages|profile-edit|my-|auth-callback|reset-password|signin|signup|settings)/.test(path)) return;

  var C = window.PEG_CONFIG || {};
  var URL_ = C.SUPABASE_URL || 'https://auth.pegasuscapitalnetwork.com';
  var KEY = C.SUPABASE_ANON || 'sb_publishable_hrR8wI6hM921mnxk7bBE_A_YKxWsoBI';
  var CK = 'peg_ticker_v1';
  // hide a figure once it is older than this many hours
  var MAX_AGE = { crypto: 3, market: 100, rates: 130, mortgage: 240, fx: 80, pegasus: 72 };

  var css =
    '.pg-tk{position:relative;z-index:210;height:30px;background:#0a111c;color:#e9eef5;border-bottom:1px solid #1d2a3c;display:flex;align-items:stretch;overflow:hidden;' +
      'font:500 12px/30px ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;letter-spacing:.01em;direction:ltr;text-align:left}' +
    '.pg-tk-tag{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:0 12px 0 14px;background:#0a111c;color:#c9a45c;font-weight:700;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;box-shadow:8px 0 14px #0a111c;z-index:1}' +
    '.pg-tk-tag em{font-style:normal;color:#8796ab}' +
    '.pg-tk-tag i{width:6px;height:6px;border-radius:50%;background:#3ecf8e;box-shadow:0 0 0 3px rgba(62,207,142,.18)}' +
    '.pg-tk-vp{flex:1 1 auto;overflow:hidden;position:relative;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 24px,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,transparent 0,#000 24px,#000 calc(100% - 24px),transparent)}' +
    '.pg-tk-tr{display:inline-flex;white-space:nowrap;will-change:transform;animation:pg-tk-run var(--pg-tk-dur,60s) linear infinite}' +
    '.pg-tk:hover .pg-tk-tr,.pg-tk:focus-within .pg-tk-tr{animation-play-state:paused}' +
    '@keyframes pg-tk-run{from{transform:translateX(0)}to{transform:translateX(-50%)}}' +
    '.pg-tk-it{display:inline-flex;align-items:baseline;gap:7px;padding:0 16px;border-right:1px solid #1a2636;color:inherit;text-decoration:none}' +
    '.pg-tk-it b{font-weight:500;color:#8796ab;font-size:11px;text-transform:uppercase;letter-spacing:.06em}' +
    '.pg-tk-it span{font-variant-numeric:tabular-nums;color:#f4f7fb;font-weight:600}' +
    '.pg-tk-it em{font-style:normal;font-variant-numeric:tabular-nums;font-size:11px}' +
    '.pg-tk-it em.up{color:#3ecf8e}.pg-tk-it em.dn{color:#ff6b6b}.pg-tk-it em.fl{color:#6b7a8f}' +
    '.pg-tk-it.peg b{color:#c9a45c}.pg-tk-it.peg:hover span{text-decoration:underline}' +
    '.pg-tk-it.note{color:#5f6e83;font-size:10.5px;letter-spacing:.04em}' +
    '@media(max-width:640px){.pg-tk{height:28px;line-height:28px;font-size:11.5px}.pg-tk-tag{padding:0 9px 0 11px;font-size:9.5px}.pg-tk-tag em{display:none}.pg-tk-it{padding:0 12px}}' +
    '@media(prefers-reduced-motion:reduce){.pg-tk-tr{animation:none}.pg-tk-vp{overflow-x:auto;scrollbar-width:none}.pg-tk-vp::-webkit-scrollbar{display:none}}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
  function fmtVal(r) {
    var v = n(r.value); if (v == null) return '';
    if (r.symbol === 'USDEUR' && v) return (1 / v).toFixed(4);
    switch (r.fmt) {
      case 'pct': return v.toFixed(2) + '%';
      case 'usd': return '$' + v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 0 : 2, minimumFractionDigits: v >= 1000 ? 0 : 2 });
      case 'fx': return v.toFixed(v >= 10 ? 2 : 4);
      case 'count': return Math.round(v).toLocaleString('en-US');
      default: return v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    }
  }
  function fmtChg(r) {
    var c = n(r.change), p = n(r.change_pct), t, cls;
    if (r.symbol === 'USDEUR') return '';
    if (c != null) { if (Math.abs(c) < 0.005) return '<em class="fl">0.00</em>'; t = (c > 0 ? '▲' : '▼') + Math.abs(c).toFixed(2); cls = c > 0 ? 'up' : 'dn'; }
    else if (p != null) { if (Math.abs(p) < 0.005) return '<em class="fl">0.00%</em>'; t = (p > 0 ? '▲' : '▼') + Math.abs(p).toFixed(2) + '%'; cls = p > 0 ? 'up' : 'dn'; }
    else return '';
    return '<em class="' + cls + '">' + t + '</em>';
  }
  function label(r) { return r.symbol === 'USDEUR' ? 'EUR/USD' : r.label; }
  function fresh(r) {
    var h = MAX_AGE[r.grp] || 100; var t = Date.parse(r.as_of || r.updated_at || 0);
    return t && (Date.now() - t) < h * 3600 * 1000;
  }
  function itemsHTML(rows) {
    var html = rows.filter(function (r) { return n(r.value) != null && fresh(r); }).map(function (r) {
      var d = r.as_of ? new Date(r.as_of) : null;
      var title = (r.source || '') + (d ? ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (r.grp === 'crypto' ? ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '') : '');
      var inner = '<b>' + esc(label(r)) + '</b><span translate="no">' + esc(fmtVal(r)) + '</span>' + fmtChg(r);
      if (r.grp === 'pegasus' && r.link) return '<a class="pg-tk-it peg" href="' + esc(r.link) + '" title="' + esc(title) + '">' + inner + '</a>';
      return '<span class="pg-tk-it" title="' + esc(title) + '">' + inner + '</span>';
    }).join('');
    if (!html) return '';
    return html + '<span class="pg-tk-it note">Delayed data · for information only</span>';
  }

  var bar, track;
  function mount() {
    if (bar) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    if (document.querySelector('.sidebar')) return; // workspace layout
    bar = document.createElement('div');
    bar.className = 'pg-tk'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Market data');
    bar.innerHTML = '<div class="pg-tk-tag"><i></i>Pegasus<em>&nbsp;Markets</em></div><div class="pg-tk-vp"><div class="pg-tk-tr"></div></div>';
    track = bar.querySelector('.pg-tk-tr');
    document.body.insertBefore(bar, document.body.firstChild);
    // headers injected later by page scripts go above us; keep the strip on top
    var mo = new MutationObserver(function () {
      var f = document.body.firstElementChild;
      while (f && (f.classList.contains('skip-link') || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(f.tagName))) f = f.nextElementSibling;
      if (f && f !== bar) document.body.insertBefore(bar, f);
    });
    mo.observe(document.body, { childList: true });
    setTimeout(function () { mo.disconnect(); }, 8000);
  }
  function render(rows) {
    if (!bar) return;
    var h = itemsHTML(rows || []);
    if (!h) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    track.innerHTML = '<div style="display:inline-flex">' + h + '</div><div style="display:inline-flex" aria-hidden="true">' + h + '</div>';
    requestAnimationFrame(function () {
      var w = track.scrollWidth / 2;
      track.style.setProperty('--pg-tk-dur', Math.max(25, Math.round(w / 45)) + 's');
    });
  }
  function load() {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(CK) || 'null'); } catch (e) {}
    if (cached && cached.rows) render(cached.rows);
    if (cached && Date.now() - cached.t < 5 * 60 * 1000) return;
    fetch(URL_ + '/rest/v1/market_ticker?select=symbol,label,value,change,change_pct,fmt,grp,sort,as_of,updated_at,source,link&order=sort.asc', { headers: { apikey: KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows)) { if (!cached) render([]); return; }
        try { sessionStorage.setItem(CK, JSON.stringify({ t: Date.now(), rows: rows })); } catch (e) {}
        render(rows);
      })
      .catch(function () { if (!cached) render([]); });
  }
  function start() { mount(); if (bar) load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
