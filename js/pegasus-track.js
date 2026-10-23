/* Pegasus — first-party page analytics (migration 101).
   No cookies and no personal data: the path without its query string, the
   referring host, utm tags, language, device class and a random id kept in
   sessionStorage for this tab only. Bots and private app pages are skipped.
   Pages report funnel steps with:
     (window.PegTrackQ = window.PegTrackQ || []).push(['claim_view', {slug: '…'}]); */
(function(){
  'use strict';
  if (window.PegTrack) return;
  var ua = navigator.userAgent || '';
  var BOT = !!navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|monitor/i.test(ua);
  var PRIVATE = /^\/(?:(?:ar|zh|ru|es|fr)\/)?(dashboard|crm|admin|my-|deal-requests|messages|profile-edit|settings|ai-assistant|workspace|inbox|billing|notifications|auth-callback|reset-password)/i;
  var C = window.PEG_CONFIG || {};
  var ENDPOINT = (C.SUPABASE_URL || 'https://auth.pegasuscapitalnetwork.com').replace(/\/$/, '') + '/rest/v1/rpc/track_event';
  var KEY = C.SUPABASE_ANON || 'sb_publishable_hrR8wI6hM921mnxk7bBE_A_YKxWsoBI';

  function ss(k, v){ try{ if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); }catch(e){ return null; } }
  var sid = ss('peg.sid');
  if (!sid || !/^[a-z0-9]{8,32}$/.test(sid)) { sid = (Math.random().toString(36).slice(2, 10) + Date.now().toString(36)).slice(0, 24); ss('peg.sid', sid); }

  // First-touch attribution for this tab: utm tags and the external referrer.
  var att = null; try{ att = JSON.parse(ss('peg.att') || 'null'); }catch(e){}
  if (!att) {
    att = {};
    try{
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function(k){ var v = q.get(k); if (v) att[k] = v.slice(0, 80); });
      var r = document.referrer ? new URL(document.referrer).hostname : '';
      if (r && r !== location.hostname) att.ref = r;
    }catch(e){}
    ss('peg.att', JSON.stringify(att));
  }

  function slugFromPath(p){ var m = p.match(/^\/(?:(?:ar|zh|ru|es|fr)\/)?(?:business|event|lend|awards\/[a-z0-9-]+|rankings\/badge)\/([a-z0-9-]+)\/?$/i); return m ? m[1].toLowerCase() : null; }

  function send(event, extra){
    if (BOT) return;
    extra = extra || {};
    var p = location.pathname;
    var lang = (document.documentElement.getAttribute('lang') || '').slice(0, 2).toLowerCase();
    try{
      fetch(ENDPOINT, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({
          p_event: event, p_path: p, p_slug: extra.slug || slugFromPath(p),
          p_ref: att.ref || null, p_utm_source: att.utm_source || null, p_utm_medium: att.utm_medium || null,
          p_utm_campaign: att.utm_campaign || null, p_lang: lang || null, p_sid: sid,
          p_device: /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop'
        })
      }).catch(function(){});
    }catch(e){}
  }

  window.PegTrack = { event: send };
  var queued = Array.isArray(window.PegTrackQ) ? window.PegTrackQ : [];
  window.PegTrackQ = { push: function(a){ if (a && a[0]) send(a[0], a[1]); } };
  if (!PRIVATE.test(location.pathname)) send('page_view');
  queued.forEach(function(a){ window.PegTrackQ.push(a); });

  // Email link scanners and rendering crawlers load pages but never touch
  // them. The first real scroll, tap, click, key press or pointer movement
  // marks this tab as a person; reports count people from this event.
  var engaged = false, mx = null;
  function engage(){
    if (engaged) return; engaged = true;
    ['scroll', 'touchstart', 'pointerdown', 'keydown', 'mousemove'].forEach(function(t){ window.removeEventListener(t, onEv, true); });
    send('engaged');
  }
  function onEv(e){
    if (e.type === 'mousemove') { // a single synthetic move is not enough
      if (!mx) { mx = [e.clientX, e.clientY]; return; }
      if (Math.abs(e.clientX - mx[0]) + Math.abs(e.clientY - mx[1]) < 12) return;
    }
    if (e.isTrusted === false) return;
    if (e.type === 'scroll' && performance.now() < 1500) return; // scroll restoration on load
    engage();
  }
  ['scroll', 'touchstart', 'pointerdown', 'keydown', 'mousemove'].forEach(function(t){ window.addEventListener(t, onEv, { capture: true, passive: true }); });
})();
