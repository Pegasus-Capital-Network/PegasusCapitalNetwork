/* Pegasus — site languages.
   One script on every page: a language switcher plus dictionary-based
   translation of the page text (including text that scripts add later).
   Dictionaries are produced by the i18n-translate function and served from
   the public storage bucket "i18n". Strings not translated yet are reported
   (public pages only) and get translated in the background.
   ?lang=ar in any link opens the page in that language. */
(function(){
  'use strict';
  if (window.__pegI18n) return; window.__pegI18n = true;

  // This script is on every page, so it also loads the first-party analytics
  // (no cookies, no personal data — see js/pegasus-track.js).
  try{ var tr = document.createElement('script'); tr.src = '/js/pegasus-track.js?v=1'; tr.defer = true; (document.head || document.documentElement).appendChild(tr); }catch(e){}

  var LANGS = [['en','English'],['ar','العربية'],['zh','中文'],['ru','Русский'],['es','Español'],['fr','Français']];
  var CODES = LANGS.map(function(l){ return l[0]; });
  var C = window.PEG_CONFIG || {};
  var SB_URL = C.SUPABASE_URL || 'https://auth.pegasuscapitalnetwork.com';
  var SB_KEY = C.SUPABASE_ANON || 'sb_publishable_hrR8wI6hM921mnxk7bBE_A_YKxWsoBI';
  var PRIVATE = /^\/(dashboard|crm|admin|my-|deal-requests|messages|profile-edit|settings|ai-assistant|workspace|inbox|billing|notifications)/i;

  function store(k, v){ try{ if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){ return null; } }

  /* ── which language ── */
  var qs = null; try{ qs = new URLSearchParams(location.search); }catch(e){}
  var pm = location.pathname.match(/^\/(ar|zh|ru|es|fr)(\/.*)?$/);
  var PATH_LANG = pm ? pm[1] : '';
  var REST = pm ? (pm[2] || '/') : location.pathname;
  var SERVER = document.documentElement.getAttribute('data-i18n-server') === PATH_LANG && !!PATH_LANG;
  var lang = PATH_LANG || (qs && qs.get('lang') || '').toLowerCase().slice(0,2);
  if (CODES.indexOf(lang) >= 0) store('peg_lang', lang);
  else {
    lang = store('peg_lang') || '';
    if (CODES.indexOf(lang) < 0) {
      lang = 'en';
      var nl = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
      for (var i = 0; i < nl.length; i++) { var c = String(nl[i]||'').toLowerCase().slice(0,2); if (c === 'en') break; if (CODES.indexOf(c) >= 0) { lang = c; break; } }
    }
  }
  var html = document.documentElement;

  /* ── switcher ── */
  var CSS = '.peg-lang{position:relative;flex:0 0 auto;margin-left:auto;margin-right:10px;z-index:260;font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
    '.peg-lang.fx{position:fixed;right:14px;top:12px;margin:0;z-index:1150}.peg-lang.fx.wait{visibility:hidden}' +
    '.pub-nav .pub-links{margin-left:auto}.tb-right .peg-lang{margin:0}' +
    '.peg-lang>button{display:inline-flex;align-items:center;gap:5px;height:34px;border:1px solid rgba(14,24,36,.16);background:rgba(255,255,255,.96);border-radius:999px;padding:0 11px;font:600 12.5px/1 Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1b3a5b;cursor:pointer;white-space:nowrap}' +
    '.peg-lang>button:hover{border-color:#1b3a5b}.peg-lang>button svg{width:15px;height:15px}.peg-lang>button i{font-style:normal;font-size:9px;opacity:.6}' +
    '.peg-lang-m{position:absolute;right:0;top:calc(100% + 8px);background:#fff;border:1px solid #e6e9ed;border-radius:12px;box-shadow:0 16px 40px rgba(14,24,36,.18);padding:6px;min-width:190px;display:none;text-align:left}' +
    '.peg-lang.open .peg-lang-m{display:block}' +
    '.peg-lang-m a{display:flex;justify-content:space-between;gap:12px;padding:9px 11px;border-radius:8px;color:#0e1824;text-decoration:none;font-size:14px}' +
    '.peg-lang-m a:hover{background:#f3f5f8}.peg-lang-m a.on{font-weight:700;color:#1b3a5b}.peg-lang-m a small{color:#8a94a1;font-size:11px;text-transform:uppercase}' +
    '.peg-lang-m p{font-size:11px;color:#8a94a1;padding:6px 11px 4px;line-height:1.4;max-width:220px}' +
    'html[dir=rtl] .peg-lang{margin-left:10px;margin-right:auto}html[dir=rtl] .pub-nav .pub-links{margin-left:0;margin-right:auto}html[dir=rtl] .peg-lang.fx{right:auto;left:14px}html[dir=rtl] .peg-lang-m{right:auto;left:0;text-align:right}' +
    'html[dir=rtl] body{text-align:right}' +
    'html.peg-i18n-wait body{opacity:0}html body{transition:opacity .15s}';
  var st = document.createElement('style'); st.textContent = CSS; (document.head || html).appendChild(st);

  if (lang !== 'en') {
    html.setAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
    if (lang === 'ar') html.setAttribute('dir', 'rtl');
  }

  function switcher(){
    if (document.querySelector('.peg-lang')) return;
    var cur = LANGS.filter(function(l){ return l[0] === lang; })[0] || LANGS[0];
    var w = document.createElement('div'); w.className = 'peg-lang'; w.setAttribute('translate','no'); w.setAttribute('data-i18n-skip','1');
    var items = LANGS.map(function(l){
      var sp = ''; try{ var q2 = new URLSearchParams(location.search); q2.delete('lang'); sp = q2.toString(); }catch(e){}
      var u = (l[0] === 'en' ? REST : '/' + l[0] + (REST === '/' ? '' : REST)) + (sp ? '?' + sp : '') + location.hash;
      return '<a href="' + u + '" data-l="' + l[0] + '"' + (l[0] === lang ? ' class="on"' : '') + '><span>' + l[1] + '</span><small>' + l[0] + '</small></a>';
    }).join('');
    w.innerHTML = '<button type="button" aria-haspopup="true" aria-label="Language" title="Language"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>' + cur[0].toUpperCase() + '<i>\u25BE</i></button>' +
      '<div class="peg-lang-m">' + items + (lang !== 'en' ? '<p>Automatic translation. The English version governs.</p>' : '') + '</div>';
    w.querySelector('button').onclick = function(e){ e.stopPropagation(); w.classList.toggle('open'); };
    w.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ store('peg_lang', a.getAttribute('data-l')); }); });
    document.addEventListener('click', function(e){ if (!w.contains(e.target)) w.classList.remove('open'); });
    // Most headers are drawn by scripts after this runs. Until one appears the
    // switcher stays hidden (a fixed corner button would sit on top of the
    // header's own buttons); it moves in the moment the header is added, and
    // only falls back to the visible corner position if no header shows up.
    w.classList.add('wait');
    place(w);
    var mo = null, iv = null, tries = 0;
    function settle(){
      if (!document.contains(w) || w.classList.contains('fx')) place(w);
      if (!w.classList.contains('fx')) { w.classList.remove('wait'); if (mo) mo.disconnect(); }
    }
    try{ mo = new MutationObserver(settle); mo.observe(document.body, { childList: true, subtree: true }); }catch(e){}
    iv = setInterval(function(){ settle(); if (++tries >= 8) w.classList.remove('wait'); if (tries > 40) { clearInterval(iv); if (mo) mo.disconnect(); } }, 500);
    settle();
  }
  // Put the switcher in the page header, next to Sign in / the account menu.
  function place(w){
    var t = document.querySelector('.tb-right');
    if (t) { if (w.parentNode !== t) t.insertBefore(w, t.firstChild); w.classList.remove('fx'); return; }
    var nav = document.querySelector('.pub-nav');
    if (nav) {
      var ref = nav.querySelector(':scope > .nav-cta') || nav.querySelector(':scope > .mob-menu-btn');
      if (w.parentNode !== nav) nav.insertBefore(w, ref || null); w.classList.remove('fx'); return;
    }
    var row = null, sels = ['header.top .top-in', 'body > header .wrap', '.hero .top', 'header.top', 'body > header'];
    for (var i = 0; i < sels.length && !row; i++) row = document.querySelector(sels[i]);
    if (row && row.lastElementChild && row.lastElementChild !== w) {
      var last = row.lastElementChild; if (last === w) return;
      row.insertBefore(w, last); w.classList.remove('fx'); return;
    }
    if (row && w.parentNode === row) return;
    if (!document.contains(w)) { w.classList.add('fx'); document.body.appendChild(w); }
  }

  function ready(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  if (lang === 'en') { ready(switcher); return; }

  /* ── translation ── */
  html.classList.add('peg-i18n-wait');
  setTimeout(function(){ html.classList.remove('peg-i18n-wait'); }, 1600);

  var DICT = null, missing = {}, done = new WeakMap(), tx = new WeakMap();
  var NUM = /\$?\d[\d,]*(?:\.\d+)?%?[KMB+]?/g;
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, CODE:1, PRE:1, SVG:1, IFRAME:1, CANVAS:1 };
  var canReport = !PRIVATE.test(REST);
  var initial = true;

  function keyOf(t){ var nums = []; var k = t.replace(NUM, function(m){ nums.push(m); return '{' + nums.length + '}'; }); return { k: k, nums: nums }; }
  function lookup(t){
    if (!/[A-Za-z]/.test(t)) return null;
    if (DICT[t]) return DICT[t];
    var o = keyOf(t);
    if (o.nums.length && DICT[o.k]) return DICT[o.k].replace(/\{(\d+)\}/g, function(m, n){ return o.nums[n-1] != null ? o.nums[n-1] : m; });
    if (canReport && !(SERVER && initial) && t.length <= 300 && !/@|https?:|www\./i.test(t)) missing[o.nums.length ? o.k : t] = 1;
    return null;
  }
  function skipEl(el){
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      if (SKIP_TAGS[e.tagName] || e.isContentEditable) return true;
      if (e.getAttribute && (e.getAttribute('translate') === 'no' || e.hasAttribute('data-i18n-skip'))) return true;
    }
    return false;
  }
  function doText(n){
    var v = n.nodeValue; if (!v || done.get(n) === v || tx.get(n) === v) return;
    var t = v.trim(); if (t.length < 2) return;
    if (skipEl(n.parentElement)) return;
    var tr = lookup(t.replace(/\s+/g, ' '));
    if (tr) { var nv = v.replace(t, tr); tx.set(n, nv); n.nodeValue = nv; } else done.set(n, v);
  }
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function doAttrs(el){
    if (skipEl(el)) return;
    ATTRS.forEach(function(a){
      var v = el.getAttribute(a); if (!v) return;
      var mark = 'data-i18n-' + a; if (el.getAttribute(mark) === v) return;
      var tr = lookup(v.trim()); if (tr) { el.setAttribute(a, tr); el.setAttribute(mark, tr); } else el.setAttribute(mark, v);
    });
    if (PATH_LANG && el.tagName === 'A') {
      var h = el.getAttribute('href') || '';
      if (h.charAt(0) === '/' && h.charAt(1) !== '/' && !/^\/(js|css|assets|data|\.netlify|api|storage|ar|zh|ru|es|fr)(\/|$)/i.test(h) && !/\.(?!html)[a-z0-9]{2,5}([?#]|$)/i.test(h)) el.setAttribute('href', '/' + PATH_LANG + (h === '/' ? '' : h));
    }
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) {
      var tv = lookup(el.value.trim()); if (tv) el.value = tv;
    }
  }
  function walk(root){
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || SKIP_TAGS[root.tagName]) return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = tw.nextNode())) doText(n);
    if (root.querySelectorAll) { doAttrs(root); root.querySelectorAll('[placeholder],[title],[aria-label],input[type=button],input[type=submit]' + (PATH_LANG ? ',a[href^="/"]' : '')).forEach(doAttrs); }
  }
  function translateTitle(){ var t = document.title; if (t && document.__pegT !== t) { var tr = lookup(t.trim()); if (tr) document.title = tr; document.__pegT = document.title; } }

  var pend = [], timer = null;
  function flush(){ timer = null; var list = pend; pend = []; list.forEach(walk); translateTitle(); scheduleReport(); }
  function observe(){
    var mo = new MutationObserver(function(ms){
      ms.forEach(function(m){
        if (m.type === 'characterData') pend.push(m.target);
        else if (m.type === 'attributes') pend.push(m.target);
        else m.addedNodes.forEach(function(x){ pend.push(x); });
      });
      if (!timer) timer = setTimeout(flush, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  }

  var reportTimer = null, reported = {};
  try{ reported = JSON.parse(store('peg_i18n_rep') || '{}') || {}; }catch(e){ reported = {}; }
  function scheduleReport(){ if (!canReport || reportTimer) return; reportTimer = setTimeout(sendReport, 4000); }
  function sendReport(){
    reportTimer = null;
    var list = Object.keys(missing).filter(function(k){ return !reported[k]; }).slice(0, 60);
    missing = {};
    if (!list.length) return;
    list.forEach(function(k){ reported[k] = 1; });
    var keys = Object.keys(reported); if (keys.length > 3000) { reported = {}; }
    store('peg_i18n_rep', JSON.stringify(reported));
    try{
      fetch(SB_URL + '/rest/v1/rpc/i18n_report', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
        body: JSON.stringify({ p_strings: list, p_page: location.pathname }) }).catch(function(){});
    }catch(e){}
  }

  function start(dict){
    DICT = dict || {};
    ready(function(){
      walk(document.body); translateTitle(); switcher(); observe();
      initial = false;
      html.classList.remove('peg-i18n-wait');
      scheduleReport();
    });
  }

  var ck = 'peg_i18n2_' + lang, cached = null;
  try{ cached = JSON.parse(store(ck) || 'null'); }catch(e){ cached = null; }
  var fresh = cached && cached.t && (Date.now() - cached.t < 10 * 60 * 1000);
  if (cached && cached.d) start(cached.d);
  if (!fresh) {
    var bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    fetch(SB_URL + '/storage/v1/object/public/i18n/' + lang + '.json?v=' + bucket).then(function(r){ return r.ok ? r.json() : {}; }).then(function(d){
      store(ck, JSON.stringify({ t: Date.now(), d: d }));
      if (!cached || !cached.d) start(d);
      else if (JSON.stringify(d).length !== JSON.stringify(cached.d).length) { DICT = d; done = new WeakMap(); ready(function(){ walk(document.body); translateTitle(); }); }
    }).catch(function(){ if (!cached || !cached.d) start({}); });
  }
})();
