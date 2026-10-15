/* ============================================================================
   PEGASUS v69 — Core: app shell, session, nav injection, helpers.
   Preview-ready: defaults to a demo session so every page renders on Netlify.
   In production, swap loadSession() to read Supabase auth + entitlements.
   ============================================================================ */
(function(){

  /* ══════════════════════════════════════════════════════════════════════════
     PLATFORM-WIDE WATERMARK — injected once here, applies to all 63 pages.
     Uses a real <img> element (not CSS ::after) so it reliably loads on live.
     The homepage keeps its own .peg-hero-wm img; this is additive + distinct.
     ══════════════════════════════════════════════════════════════════════════ */
  (function injectWatermark(){
    try{
      var wm=document.createElement('div');
      wm.className='peg-wm-global';
      wm.setAttribute('aria-hidden','true');
      // Use pegasus-symbol.svg: vector, crisp at any size, deployed in brand package
      var img=document.createElement('img');
      img.src='/assets/brand/pegasus-mark.png';
      img.alt='';
      img.setAttribute('draggable','false');
      img.setAttribute('fetchpriority','low');  // don't delay critical resources
      img.setAttribute('loading','lazy');
      wm.appendChild(img);
      document.body.appendChild(wm);
    }catch(e){}  // silent fail — never blocks page
  })();


  const Store = window.PegStore;
  // session shim — proxies the global store so legacy pages keep working
  const sessionProxy = ()=>{ const st=Store.get(); const p=st.profile||{}; return {
    demo: st.mode==='demo', name:p.full_name||'Member', email:(st.user&&st.user.email)||p.email||'',
    initials:(p.full_name||'M ').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase(),
    tier: st.tier, role:p.role, profile:p, subscription: st.subscription||{},
    usage: st.usage, onboarding_complete: !!p.onboarding_complete };
  };
  const T = ()=> (window.PEG_TIERS||{})[Store.get().tier] || {};
  const lim = k => (T().limits||{})[k];

  // boot(): hydrate the global store (live or demo) then render. Use on every
  // page that needs real state. Re-renders on store changes.
  /* Password show/hide toggle — capture-phase event delegation.
     Registered once in core.js; covers every page that loads it.
     Capture phase (3rd arg = true) fires BEFORE the input receives the click,
     so the .pw-toggle button wins the pointer-event race on Safari/iPad/WebKit
     where native form elements can paint above positioned children.           */
  document.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.pw-toggle') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var wrap = btn.closest ? btn.closest('.pw-wrap') : btn.parentElement;
    if (!wrap) return;
    var inp = wrap.querySelector('input');
    if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.innerHTML = show ? '&#x1F648;' : '&#x1F441;';
    btn.title    = show ? 'Hide password' : 'Show password';
  }, true);

  async function boot(render){
    await Store.hydrate();
    render(Store.get());
    Store.subscribe(()=>{}); // keep store warm; pages opt into live re-render via Store.subscribe
  }
  // --- helpers (restored) ---
  function el(id){ return document.getElementById(id); }
  function fmt(n){ n=+n||0; const a=Math.abs(n);
    if(a>=1e9) return '$'+(n/1e9).toFixed(1).replace(/\.0$/,'')+'B';
    if(a>=1e6) return '$'+(n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
    if(a>=1e3) return '$'+Math.round(n/1e3)+'K';
    return '$'+Math.round(n).toLocaleString(); }
  // HTML-escape a value before interpolating it into an innerHTML sink.
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  // Allow only safe URL schemes in an href (blocks javascript:, data:, etc.).
  function safeUrl(u){ u=String(u==null?'':u).trim(); if(!u) return '#'; return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(u) ? esc(u) : '#'; }
  function toast(icon,bg,title,sub){
    const t=document.createElement('div'); t.className='toast';
    t.innerHTML='<div class="toast-ic" style="background:'+(bg||'var(--blue-dim)')+'">'+(icon||'\u2022')+'</div>'+
      '<div><div class="toast-t">'+esc(title||'')+'</div>'+(sub?'<div class="toast-s">'+esc(sub)+'</div>':'')+'</div>';
    document.body.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),320); },2800);
  }

  // --- public nav (full-site mega menu) ---
  function publicNav(active){
    const G=(label,items)=>`<div class="nav-group"><span tabindex="0" role="button" aria-haspopup="true">${label} \u25BE</span><div class="nav-drop">${items.map(i=>`<a href="${i[1]}"><span>${i[0]}</span>${i[2]?`<small>${i[2]}</small>`:''}</a>`).join('')}</div></div>`;
    const who=G('Who It’s For',[['Capital Providers','/category-capital-providers.html','Lenders, funds & investors'],['Capital Seekers','/category-capital-seekers.html','Developers & borrowers'],['Real Estate Agents','/category-real-estate-agents.html','Agents & brokers'],['RWA Partners','/category-rwa.html','Real-world asset partners'],['People','/people','Public professional profiles'],['Businesses','/businesses','Companies across the network'],['Events','/events','Capital & industry events']]);
    const learn=G('Learn',[['How Pegasus Works','/how-it-works.html','The system explained'],['Growth Capital','/growth-capital.html','Financing & programs'],['Capital Sessions','/capital-sessions.html','Live institutional briefings'],['Capital Academy','/capital-academy.html','Finance fundamentals'],['Network Badge','/network-badge.html','Show your Pegasus connection'],['FAQ','/faq.html','Common questions']]);
    return `<a href="#maincontent" class="skip-link" onclick="var m=document.getElementById('maincontent')||document.querySelector('main,section,.section,.auth-wrap,.ar-wrap,.view');if(m){m.setAttribute('tabindex','-1');m.focus();}">Skip to content</a><nav class="pub-nav">
      <a class="brand" href="/"><img class="brand-mark" src="/assets/brand/pegasus-mark.png" alt="Pegasus"><span>Pegasus</span></a>
      <div class="pub-links"><a href="/people" class="${active==='People'||active==='Capital'?'on':''}">Capital &amp; Real Estate</a><a href="/ai-network.html" class="${active==='AI'?'on':''}">Pegasus AI</a><a href="/private-network.html" class="${active==='Private'?'on':''}">Private Network</a><a href="/how-it-works.html" class="${active==='How'?'on':''}">How it works</a></div>
      <div class="nav-cta" id="pub-nav-cta"><a class="btn btn-ghost" id="nav-signin-btn" href="/signin.html">Sign In</a><a class="btn btn-pri nav-create" id="nav-create-btn" href="/signup.html">Create Free Profile</a></div>
      <button class="mob-menu-btn" id="mobMenuBtn" aria-label="Menu"><span></span><span></span><span></span></button>
    </nav>
    <div class="mob-overlay" id="mobOverlay"></div>
    <div class="mob-drawer" id="mobDrawer">
      <div class="mob-drawer-head"><img src="/assets/brand/pegasus-wordmark.png" style="height:24px"><button class="mob-drawer-close" id="mobClose" aria-label="Close menu">✕</button></div>
      <div class="mob-drawer-nav" id="mobDrawerNav">
        <a href="/people">Capital &amp; Real Estate</a><a href="/ai-network.html">Pegasus AI</a><a href="/private-network.html">Private Network</a><a href="/how-it-works.html">How it works</a>
        <div class="mob-sec">Capital &amp; Real Estate</div>
        <a href="/realtors.html">Realtors</a><a href="/find-a-lender.html">Lenders</a><a href="/showcase.html">Opportunities</a>
        <div class="mob-sec">More</div>
        <a href="/about.html">About</a><a href="/contact.html">Contact</a><a href="/faq.html">FAQ</a>
      </div>
      <div class="mob-drawer-foot" id="mobDrawerFoot"><a class="btn btn-ghost" href="/signin.html">Sign In</a><a class="btn btn-pri nav-create" href="/signup.html">Create Profile</a></div>
    </div>
`;
  }
  // --- app shell (sidebar + topbar) ---
  function mountApp(opts){
    const active=opts.active, title=opts.title, sub=opts.sub||'';
    const S=sessionProxy(); const st=Store.get();
    const t=S.tier, meta=T();
    const drCap=lim('dealRooms'); const drBadge = drCap===Infinity?`${S.usage.rooms}`:(drCap>0?`${S.usage.rooms}/${drCap}`:null);
    const meLocked = lim('matchEngine')==='none';
    const item=(ic,label,href,o={})=>{
      const locked=o.locked, badge=o.badge, act=o.act||label;
      return `<a class="sb-item ${active===act?'active':''}" href="${href}">
        <span class="sb-ic">${ic}</span>${label}
        ${badge?`<span class="sb-badge ${locked?'lock':'b'}">${badge}</span>`:''}${locked?`<span class="sb-badge lock">🔒</span>`:''}</a>`;
    };
    const isAdm = (typeof Store!=='undefined'&&Store.isAdmin&&Store.isAdmin());
    const sidebar=`<aside class="sidebar">
      <div class="sb-head"><img class="brand-mark" src="/assets/brand/pegasus-mark.png" alt="Pegasus"><div><div class="sb-logo">Pegasus</div><div class="sb-ws">Workspace</div></div></div>
      <div class="sb-nav">
        <div class="sb-sec">Network</div>
        ${item('◎','Network Feed','/feed',{act:'Feed'})}
        ${item('◆','Find a Lender','/find-a-lender',{act:'Find a Lender'})}
        ${item('⬡','Members Network','/members.html',{act:'Members'})}
        ${item('▤','Business Directory','/businesses')}
        <div class="sb-sec">My Work</div>
        ${item('▦','Workspace','/dashboard.html',{act:'Dashboard'})}
        ${item('◇','Requests','/network-requests.html',{act:'Network Requests'})}
        ${item('◇','Financing Requests','/deal-requests.html',{act:'Financing Requests'})}
        ${item('◈','Deal Rooms','/deal-rooms.html',{badge:drBadge,locked:drCap===0})}
        ${item('▣','CRM','/crm.html')}
        <div class="sb-sec">Presentation</div>
        ${item('◉','My Profile',ownProfilePath(),{act:'My Profile'})}
        ${item('⚙','Edit Profile','/profile-edit.html')}
        ${item('◫','Business Pages','/my-presences.html')}
        ${item('❖','Opportunities & Showcases','/showcase.html',{act:'Showcase'})}
        ${item('⤴','Share Studio','/share-studio.html')}
        <div class="sb-sec">Growth</div>
        ${item('◎','Match Engine','/match-engine.html',{locked:meLocked})}
        ${item('◆','Capital Intelligence','/intelligence.html',{act:'Intelligence'})}
        ${item('✦','Ask Pegasus','/ai-assistant.html',{act:'Capital Assistant'})}
        <div class="sb-sec">Account</div>
        ${item('▤','Access & Growth','/membership.html',{act:'Billing & Plan'})}
        ${item('◈','Trust / Reviewed Status','/apply-review.html',{act:'Reviewed Status'})}
        ${item('⚙','Settings','/profile-edit.html',{act:'Settings'})}
        ${isAdm?`<div class="sb-sec">Admin</div>
        ${item('⚑','Admin Console','/admin.html',{act:'Admin'})}
        ${item('◆','Capital Intelligence','/admin/intelligence',{act:'Capital Intelligence Admin'})}
        ${item('◆','Partner Network','/admin/partner-network',{act:'Partner Network Admin'})}
        ${item('◇','Admin Requests','/admin-requests.html',{act:'Admin Requests'})}
        ${item('◈','Admin Trust','/admin-trust-reviews.html',{act:'Admin · Trust'})}
        ${item('▣','Showcase Moderation','/showcase-admin.html',{act:'Showcase Moderation'})}`:''}
      </div>
      <div class="sb-foot">
        <div class="sb-tier"><div class="sb-tier-name"><span class="dot" style="background:${meta.dot}"></span>${meta.name}</div>
          <div class="sb-tier-blurb">${meta.layer}</div>
          ${t!=='gold'?`<button class="sb-tier-cta" style="background:var(--blue);color:#fff" onclick="location.href='/membership.html'">Upgrade Access →</button>`:`<button class="sb-tier-cta" style="background:var(--gold-dim);color:var(--gold);border:1px solid rgba(170,137,38,0.25)" onclick="location.href='/membership.html'">Manage Plan</button>`}
        </div>
        <a class="sb-prof" href="${ownProfilePath()}"><div class="avatar">${esc(S.initials)}</div><div><div class="sb-uname">${esc(S.name)}</div><div class="sb-uemail">${esc(S.email)}</div></div></a>
      </div>
    </aside>`;
    const unread=st.counts.unreadNotifications||0;
    const topbar=`<div class="topbar">
      <div><h1 class="tb-title">${esc(title)}</h1><div class="tb-sub">${esc(sub)}</div></div>
      <div class="tb-right">
        <div class="tier-chip" style="background:${t==='gold'?'var(--gold-dim)':'var(--blue-dim)'};color:${t==='gold'?'var(--gold)':'var(--blue-lt)'};border:1px solid ${t==='gold'?'rgba(170,137,38,0.25)':'rgba(34,113,195,0.25)'}"><span class="dot" style="background:${meta.dot}"></span>${meta.name}<span class="tier-layer"> · ${meta.layer}</span></div>
        <div style="position:relative"><button class="tb-icon" aria-label="${unread?('Notifications, '+unread+' unread'):'Notifications'}" onclick="Pegasus.toggleNotif(event)">🔔${unread?`<span style="position:absolute;top:-3px;right:-3px;background:var(--red);color:#fff;font-size:8px;font-family:var(--mono);min-width:14px;height:14px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px">${unread}</span>`:''}</button><div id="notifPanel"></div></div>
        <div style="position:relative">
          <button class="tb-acct" title="My Account" aria-label="My Account — open account menu" onclick="Pegasus.toggleAccount(event)" style="display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 10px 0 6px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--text);cursor:pointer;font-size:13px"><span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:var(--blue-dim);color:var(--blue-lt);font-size:11px;font-weight:600">${esc(S.initials)||"◉"}</span><span class="tb-acct-name" style="font-weight:500">${esc((S.name||'Account').split(' ')[0])}</span><span aria-hidden="true" style="color:var(--text3)">▾</span></button>
          <div id="acctMenu"></div>
        </div>
      </div></div>`;
    document.body.innerHTML =
      `<a href="#maincontent" class="skip-link" onclick="var m=document.getElementById('maincontent')||document.querySelector('main,section,.section,.auth-wrap,.ar-wrap,.view');if(m){m.setAttribute('tabindex','-1');m.focus();}">Skip to content</a><div class="shell">${sidebar}<div class="main">${topbar}<main class="view" id="maincontent" tabindex="-1"><div class="wrap-narrow" id="pegView"></div></main></div></div>`+
      `<div id="modalRoot"></div><nav class="mob-tabbar"><a class="mob-tab ${active==='Dashboard'?'active':''}" href="/dashboard.html"><span class="mob-tab-ic">▦</span>Dashboard</a><a class="mob-tab ${active==='Deal Rooms'?'active':''}" href="/deal-rooms.html"><span class="mob-tab-ic">◈</span>Rooms</a><a class="mob-tab ${active==='Match Engine'?'active':''}" href="/match-engine.html"><span class="mob-tab-ic">◎</span>Match</a><a class="mob-tab ${active==='Capital Assistant'?'active':''}" href="/ai-assistant.html"><span class="mob-tab-ic">✦</span>Ask</a><a class="mob-tab ${active==='My Profile'?'active':''}" href="${ownProfilePath()}"><span class="mob-tab-ic">◉</span>Profile</a></nav>`;
    const v=el('pegView');
    /* Admin Console — live DB check (bypasses stale store cache entirely)
     * Queries profiles.role directly from Supabase after sidebar renders.
     * Both adds link (if admin) and removes it (if non-admin slipped through).
     * Non-blocking async — sidebar renders instantly, link pops in ~200ms. */
    (async function checkAdminRole(){
      try {
        var sb = await window.PegSB.ready;
        var userRes = await sb.auth.getUser();
        var uid = userRes && userRes.data && userRes.data.user && userRes.data.user.id;
        if (!uid) return;
        var res = await sb.from('profiles').select('role, is_admin, pci_role').eq('id', uid).maybeSingle();
        /* CRITICAL: if query errored, do NOT remove the existing link.
         * A failed query must never remove the admin link — only an explicit
         * role !== 'admin' response should hide it. */
        if (res.error) {
          /* CRITICAL: failed query must NOT remove the link. Retry once, then bail. */
          console.debug('[Admin] query error — retrying once:', res.error.message);
          var res2 = await sb.from('profiles').select('role, is_admin, pci_role').eq('id', uid).maybeSingle();
          if (res2.error) {
            window.__PEG_ADMIN_DEBUG = { uid: uid, role: null, isAdmin: false, error: res2.error.message, source: 'core-recheck-failed' };
            return; /* leave sidebar untouched */
          }
          res = res2;
        }
        var isAdmin = res.data && (res.data.is_admin === true || res.data.role === 'admin');
        /* Capital Intelligence analyst — read + manual property/lender editing,
         * no Admin Console. Gets only the Capital Intelligence link. */
        var isAnalyst = res.data && res.data.pci_role === 'analyst';
        var canCI = isAdmin || isAnalyst;
        window.__PEG_ADMIN_DEBUG = { uid: uid, role: res.data && res.data.role, is_admin_flag: res.data && res.data.is_admin, pci_role: res.data && res.data.pci_role, isAdmin: isAdmin, source: 'core-recheck' };
        var nav = document.querySelector('.sb-nav');
        if (!nav) return;
        var existing = nav.querySelector('[href="/admin.html"]');
        var ciLink = nav.querySelector('[href="/admin/intelligence"]');
        var pnLink = nav.querySelector('[href="/admin/partner-network"]');
        /* Admin Console + Partner Network links — admins only. */
        if (isAdmin && !existing) {
          nav.insertAdjacentHTML('beforeend',
            '<a class="sb-item" href="/admin.html"><span class="sb-ic">⚑</span>Admin Console</a>');
          console.debug('[Admin] Admin Console link injected for uid:', uid);
        } else if (!isAdmin && existing) {
          existing.parentNode && existing.parentNode.removeChild(existing);
          console.debug('[Admin] Admin Console link removed — role is:', res.data && res.data.role);
        }
        if (isAdmin && !pnLink) {
          nav.insertAdjacentHTML('beforeend',
            '<a class="sb-item" href="/admin/partner-network"><span class="sb-ic">◆</span>Partner Network</a>');
        } else if (!isAdmin && pnLink) {
          pnLink.parentNode && pnLink.parentNode.removeChild(pnLink);
        }
        /* Capital Intelligence link — admins OR analysts. */
        if (canCI && !ciLink) {
          nav.insertAdjacentHTML('beforeend',
            '<a class="sb-item" href="/admin/intelligence"><span class="sb-ic">◆</span>Capital Intelligence</a>');
          console.debug('[Admin] Capital Intelligence link injected for uid:', uid);
        } else if (!canCI && ciLink) {
          ciLink.parentNode && ciLink.parentNode.removeChild(ciLink);
          console.debug('[Admin] Capital Intelligence link removed for uid:', uid);
        }
      } catch(e) { /* Non-fatal — admin link just won't show if DB unreachable */ }
    })();
    if(Store.needsOnboarding && Store.needsOnboarding() && String(active).indexOf('Admin')!==0){
      v.insertAdjacentHTML('afterbegin',`<div class="banner bn-info"><div class="banner-msg">◷ <span>Your profile is ${S.profile.profile_completion||0}% complete. Finish onboarding to improve match quality and visibility.</span></div><a class="btn btn-sm btn-pri" href="/profile-edit.html">Complete Profile →</a></div>`);
    }
    if(S.demo){ v.insertAdjacentHTML('afterbegin',
      `<div class="banner bn-demo">◷ Viewing a demonstration of the ${meta.name} experience. <a href="/signin.html" style="color:inherit;text-decoration:underline">Sign in</a> to access your live workspace.</div>`); }
    return v;
  }

  function mountPublic(active){
    const host=document.createElement('div'); host.innerHTML=publicNav(active);
    // Move ALL top-level nav nodes (nav + overlay + drawer), not just <nav>.
    // Previous code only inserted host.firstElementChild and silently dropped
    // the overlay/drawer, which is why the hamburger appeared to do nothing.
    const frag=document.createDocumentFragment();
    while(host.firstChild){ frag.appendChild(host.firstChild); }
    document.body.insertBefore(frag, document.body.firstChild);

    /* Apply authed nav immediately — Store is already hydrated by boot()
       before mountPublic runs, so session detection is reliable here. */
    pegApplyAuthedNav();
    setTimeout(updateNavForAuth, 0); /* async confirm + cache slug */

    // Wire the mobile drawer. (Was previously written as an inline <script>
    // inside the template literal, which the browser parses but never executes
    // when injected via innerHTML.)
    (function(){
      var btn=document.getElementById('mobMenuBtn');
      var drawer=document.getElementById('mobDrawer');
      var overlay=document.getElementById('mobOverlay');
      var closeBtn=document.getElementById('mobClose');
      function close(){ if(drawer)drawer.classList.remove('open'); if(overlay)overlay.classList.remove('open'); document.body.style.overflow=''; }
      if(btn) btn.addEventListener('click',function(){ if(drawer)drawer.classList.add('open'); if(overlay)overlay.classList.add('open'); document.body.style.overflow='hidden'; });
      if(closeBtn) closeBtn.addEventListener('click',close);
      if(overlay) overlay.addEventListener('click',close);
      // Close drawer when any link inside it is tapped
      if(drawer) drawer.querySelectorAll('a').forEach(function(a){ a.addEventListener('click',close); });
      // Close on Escape
      document.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });
    })();

    // Touch-device tap-toggle for desktop-nav dropdowns (iPad, etc.).
    (function(){
      function isTouch(){ return ('ontouchstart' in window)||navigator.maxTouchPoints>0; }
      if(!isTouch()) return;
      var navHost=document.querySelector('.pub-nav');
      if(!navHost) return;
      function closeAll(){ navHost.querySelectorAll('.nav-group.open').forEach(function(g){g.classList.remove('open');}); }
      navHost.querySelectorAll('.nav-group>span').forEach(function(trigger){
        trigger.addEventListener('click',function(e){
          e.stopPropagation();
          var grp=trigger.parentElement;
          var wasOpen=grp.classList.contains('open');
          closeAll();
          if(!wasOpen) grp.classList.add('open');
        });
      });
      document.addEventListener('click',function(e){ if(!navHost.contains(e.target)) closeAll(); });
      navHost.querySelectorAll('.nav-drop a').forEach(function(a){ a.addEventListener('click',closeAll); });
    })();
  }

  function footer(){
    const col=(h,links)=>`<div><div style="font-size:9px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px">${h}</div>${links.map(l=>`<a href="${l[1]}" style="display:block;font-size:12px;color:var(--text2);padding:4px 0">${l[0]}</a>`).join('')}</div>`;
    const soc=[['Facebook','https://www.facebook.com/profile.php?id=61595469772616','M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21z'],['Instagram','https://www.instagram.com/pegasuscapitalnetwork/','M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4zm0 7.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm4.8-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM12 4.6c2.4 0 2.7 0 3.6.1 2.4.1 3.6 1.3 3.7 3.7.1.9.1 1.2.1 3.6s0 2.7-.1 3.6c-.1 2.4-1.3 3.6-3.7 3.7-.9.1-1.2.1-3.6.1s-2.7 0-3.6-.1c-2.4-.1-3.6-1.3-3.7-3.7C4.6 14.7 4.6 14.4 4.6 12s0-2.7.1-3.6C4.8 6 6 4.8 8.4 4.7c.9-.1 1.2-.1 3.6-.1zM12 3c-2.4 0-2.8 0-3.7.1C5 3.2 3.2 5 3.1 8.3 3 9.2 3 9.6 3 12s0 2.8.1 3.7C3.2 19 5 20.8 8.3 20.9c.9.1 1.3.1 3.7.1s2.8 0 3.7-.1c3.3-.1 5.1-1.9 5.2-5.2.1-.9.1-1.3.1-3.7s0-2.8-.1-3.7C20.8 5 19 3.2 15.7 3.1 14.8 3 14.4 3 12 3z'],['LinkedIn','https://www.linkedin.com/company/pegasus-capital-network/','M6.9 8.9H3.6V20h3.3zM5.2 3.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM20.4 13.6c0-3-1.6-4.9-4.3-4.9-1.4 0-2.4.8-2.8 1.5V8.9H10V20h3.3v-5.5c0-1.5.3-2.9 2.1-2.9s1.8 1.7 1.8 3V20h3.3z'],['Facebook Group','https://www.facebook.com/groups/2541152063054447','M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 12.5c-2.7 0-6 1.3-6 3.5V19h12v-3c0-2.2-3.3-3.5-6-3.5zm8 .5c-.5 0-1 0-1.6.1 1 .8 1.6 1.8 1.6 2.9v3h6v-2.7c0-2.1-3.2-3.3-6-3.3z']];
    const socRow=`<div style="display:flex;gap:8px;margin-top:16px">${soc.map(s=>`<a href="${s[1]}" target="_blank" rel="noopener" aria-label="Pegasus Capital Network on ${s[0]}" title="${s[0]}" style="display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;border:1px solid var(--border, rgba(255,255,255,.15));border-radius:8px;color:var(--text2)"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${s[2]}"/></svg></a>`).join('')}</div>`;
    return `<footer class="footer">
      <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr 1fr;gap:30px;margin-bottom:32px">
        <div><div class="brand" style="margin-bottom:12px"><img class="brand-mark" src="/assets/brand/pegasus-mark.png" alt="Pegasus"><span>Pegasus</span></div><div style="font-size:12px;color:var(--text3);line-height:1.6;max-width:240px">Three networks, one ecosystem. Capital, AI, and the Private Network.</div>${socRow}</div>
        ${col('Capital & Real Estate',[['Realtors','/realtors.html'],['Lenders','/find-a-lender'],['Borrowers','/borrowers.html'],['Opportunities','/showcase.html'],['Lender Rankings','/rankings'],['Top Lenders 2025','/awards/top-lenders-2025'],['Financing Requests','/deal-requests.html']])}
        ${col('Pegasus AI',[['AI Network','/ai-network.html'],['Needs Board','/ai-needs.html'],['Intelligence','/intel.html']])}
        ${col('Private & Account',[['Private Network','/private-network.html'],['How It Works','/how-it-works.html'],['Membership','/membership.html'],['Network Feed','/feed']])}
        ${col('Company',[['About','/about.html'],['Contact','/contact.html'],['FAQ','/faq.html'],['Trust & Safety','/trust-and-safety.html']])}
      </div>
      <div class="footer-legal">Pegasus Lenders Group LLC operates as a membership marketplace platform. Pegasus is not a mortgage lender, mortgage loan originator (MLO), broker-dealer, real estate broker, or registered investment advisor. All connections made through the Pegasus platform are member-directed. Users must consult licensed professionals for all financial and legal decisions. \u00A9 2026 Pegasus Lenders Group LLC. &nbsp;·&nbsp; <a href="/privacy.html" style="color:var(--text3)">Privacy</a> &nbsp;·&nbsp; <a href="/terms.html" style="color:var(--text3)">Terms</a> &nbsp;·&nbsp; <a href="/disclosures.html" style="color:var(--text3)">Disclosures</a></div></footer>`;
  }
  /* Render modal HTML into #modalRoot. mountApp() creates that container, but
     mountPublic() pages (public profile, business pages, opportunity pages) do
     not — so auto-create it on demand. Without this, modal() threw on null and
     buttons like "Add Opportunity" failed silently. */
  function modalHost(){ var m=el('modalRoot'); if(!m){ m=document.createElement('div'); m.id='modalRoot'; document.body.appendChild(m); } return m; }

  /* ── Form-safe modals ────────────────────────────────────────────────────────
     A modal that contains form fields must NEVER evaporate by accident. Clicking
     outside it or pressing Escape no longer discards what you typed: while the
     form has content, those gestures are ignored (a gentle hint is shown instead)
     and the only ways out are an explicit ✕ / Cancel or the "Clear" button.
     Anything typed is also auto-saved as a local draft, so even an explicit close
     (or a reload) restores it on reopen — your text stays until you clear it or
     successfully submit. Empty modals and modals without fields still close on
     outside-click as before. */
  var __activeDraftKey = null;
  function __modalFields(){
    var m=el('modalRoot'); if(!m) return [];
    return Array.prototype.slice.call(m.querySelectorAll('input,textarea,select')).filter(function(f){
      var t=(f.type||'').toLowerCase(); return t!=='button' && t!=='submit' && t!=='hidden' && t!=='search';
    });
  }
  // "Has content the user could lose" — content typed, or an existing value changed.
  function modalDirty(){
    return __modalFields().some(function(f){
      var t=(f.type||'').toLowerCase();
      if(t==='checkbox'||t==='radio') return !!f.checked !== !!f.defaultChecked;
      var v=(f.value==null?'':String(f.value)).trim();
      var d=(f.defaultValue==null?'':String(f.defaultValue)).trim();
      return v!=='' && v!==d;
    });
  }
  function __draftKey(){
    try{
      var ids=__modalFields().map(function(f){return f.id||f.name||'';}).filter(Boolean).sort().join('|');
      if(!ids) return null;
      return 'peg.draft:'+location.pathname+'#'+ids;
    }catch(e){ return null; }
  }
  function clearDraft(){
    try{ if(__activeDraftKey) localStorage.removeItem(__activeDraftKey); }catch(e){}
  }
  // Empty every field in the open modal and forget its saved draft (the "Clear" action).
  function clearModalFields(){
    __modalFields().forEach(function(f){
      var t=(f.type||'').toLowerCase();
      if(t==='checkbox'||t==='radio'){ f.checked=f.defaultChecked; }
      else if(f.tagName==='SELECT'){ f.selectedIndex=0; }
      else { f.value=''; }
      try{ f.dispatchEvent(new Event('input',{bubbles:true})); f.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){}
    });
    clearDraft();
    var first=__modalFields()[0]; if(first){ try{ first.focus(); }catch(e){} }
  }
  // A "blank" form is a creation form — no text field arrives pre-filled. Only
  // these get local draft persistence; pre-filled edit forms share field ids
  // across records, so persisting them could leak one record's draft into
  // another. Edit forms still get the no-evaporate dismissal guard (modalDirty).
  function __isBlankForm(){
    return __modalFields().every(function(f){
      if(f.tagName==='SELECT') return true; // selects always carry a value
      var t=(f.type||'').toLowerCase();
      if(t==='checkbox'||t==='radio') return true;
      return (f.defaultValue==null?'':String(f.defaultValue)).trim()==='';
    });
  }
  function __wireModalDrafts(){
    var m=el('modalRoot'); if(!m) return;
    var key=(__modalFields().length && __isBlankForm()) ? __draftKey() : null;
    __activeDraftKey=key;
    if(key){
      // Restore a previous draft into still-untouched fields.
      try{
        var saved=JSON.parse(localStorage.getItem(key)||'null');
        if(saved){ __modalFields().forEach(function(f){
          var id=f.id||f.name; if(!id || saved[id]==null) return;
          var cur=(f.value==null?'':String(f.value)).trim();
          var def=(f.defaultValue==null?'':String(f.defaultValue)).trim();
          if(cur==='' || cur===def){ f.value=saved[id]; }
        }); }
      }catch(e){}
      // Auto-save on every edit.
      m.addEventListener('input', function(){
        try{
          var data={}; __modalFields().forEach(function(f){ var id=f.id||f.name; if(id) data[id]=f.value; });
          localStorage.setItem(key, JSON.stringify(data));
        }catch(e){}
      });
    }
  }
  function modal(html){ modalHost().innerHTML=html; __wireModalDrafts(); }
  function closeModal(){ const m=el('modalRoot'); if(m) m.innerHTML=''; __activeDraftKey=null; }
  // Guarded close for outside-click / Escape: keeps form content from evaporating.
  function dismissModal(){
    if(modalDirty()){
      toast('✎','var(--gold-dim)','Draft kept','Your text is safe. Use Clear to empty it, or ✕ / Cancel to close.');
      return;
    }
    closeModal();
  }
  // Single global Escape guard for any Pegasus modal.
  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape') return;
    var m=el('modalRoot'); if(m && m.firstChild){ dismissModal(); }
  });

  /* ── Unsaved-changes guard for full-page forms ───────────────────────────────
     Full-page forms (profile editor, signup…) can't evaporate on an outside
     click, but a stray Back / reload / tab-close still throws the work away.
     guardUnsaved(isDirty) wires the browser's native "Leave site? Changes you
     made may not be saved." prompt, firing only while isDirty() is true. It
     returns a release() to call once the form is saved (or the user is leaving
     on purpose) so the prompt never nags after the work is safe. */
  function guardUnsaved(isDirty){
    function handler(e){
      try{ if(isDirty && isDirty()){ e.preventDefault(); e.returnValue=''; return ''; } }catch(_){}
    }
    window.addEventListener('beforeunload', handler);
    return function release(){ try{ window.removeEventListener('beforeunload', handler); }catch(_){} };
  }

  /* ── Engagement ("How to engage") ────────────────────────────────────────────
     Opens a self-styled modal letting a logged-in member express interest in a
     business page (presence) or a specific opportunity. Records the request via
     the secure RPC, which notifies the page managers. Personal contact details
     are never exchanged here — Pegasus mediates the introduction.
     opts: { presenceId, opportunityId?, name (the business/opportunity name) } */
  var ENGAGE_INTENTS=[
    ['interested','I’m interested'],
    ['introduction','Request an introduction'],
    ['have_capital','I have capital'],
    ['need_financing','I need financing'],
    ['have_deal','I have a deal'],
    ['partner','I want to partner'],
    ['contact','Contact through Pegasus']
  ];
  async function engageOpen(opts){
    opts=opts||{};
    if(!opts.presenceId && !opts.opportunityId){ toast('!','var(--gold-dim)','Unavailable','This page cannot accept requests yet.'); return; }
    var c=null; try{ c=await window.PegSB.ready; }catch(e){ c=null; }
    var uid=null; if(c){ try{ var u=await c.auth.getUser(); uid=u&&u.data&&u.data.user&&u.data.user.id; }catch(e){} }
    if(!uid){ location.href='/signin.html'; return; }
    var name=opts.name||'this page';
    var sc='position:fixed;inset:0;background:rgba(18,22,28,0.46);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;z-index:1000;overflow-y:auto';
    var bx='background:var(--bg);border:1px solid var(--border);border-radius:var(--r4);width:100%;max-width:480px;box-shadow:0 24px 70px rgba(0,0,0,.22);overflow:hidden';
    var opts_html=ENGAGE_INTENTS.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+'</option>';}).join('');
    modal('<div style="'+sc+'" onclick="if(event.target===this)Pegasus.dismissModal()"><div style="'+bx+'">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border)"><div style="font-family:var(--serif);font-size:18px;color:var(--text)">Engage with '+esc(name)+'</div><button onclick="Pegasus.closeModal()" style="border:none;background:var(--bg2);color:var(--text2);width:30px;height:30px;border-radius:8px;cursor:pointer">✕</button></div>'+
      '<div style="padding:20px 22px">'+
        '<label style="display:block;font-size:11px;color:var(--text3);margin-bottom:5px">What would you like to share?</label>'+
        '<select id="engIntent" style="width:100%;padding:10px 11px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;margin-bottom:14px">'+opts_html+'</select>'+
        '<label style="display:block;font-size:11px;color:var(--text3);margin-bottom:5px">Message <span style="color:var(--text4)">(optional)</span></label>'+
        '<textarea id="engMsg" rows="4" placeholder="A short note about why you’re reaching out…" style="width:100%;padding:10px 11px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical"></textarea>'+
        '<div style="font-size:11px;color:var(--text4);margin-top:10px;line-height:1.5">Pegasus shares your profile with this page’s team so they can respond. Your private contact details are never shown.</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:10px;padding:15px 22px;border-top:1px solid var(--border);background:var(--bg1)"><button class="btn btn-ghost btn-sm" onclick="Pegasus.clearModalFields()">Clear</button><div style="flex:1"></div><button class="btn btn-ghost" onclick="Pegasus.closeModal()">Cancel</button><button class="btn btn-pri" id="engSend">Send</button></div>'+
    '</div></div>');
    var sendBtn=el('engSend');
    sendBtn.onclick=async function(){
      var intent=(el('engIntent')||{}).value||'interested';
      var msg=(el('engMsg')||{}).value||'';
      sendBtn.disabled=true; sendBtn.textContent='Sending…';
      try{
        var r=await c.rpc('create_engagement_request',{p_presence_id:opts.presenceId||null,p_opportunity_id:opts.opportunityId||null,p_intent:intent,p_message:msg});
        if(r&&r.error) throw r.error;
        clearDraft();
        closeModal();
        toast('✓','var(--green-dim)','Sent','Your request was delivered to the team behind '+name+'.');
      }catch(err){
        console.error('[engage] failed:',err);
        var m=(err&&err.message)||'Could not send. Apply migration 055 and restart Supabase, then try again.';
        toast('!','var(--gold-dim)','Could not send',m);
        sendBtn.disabled=false; sendBtn.textContent='Send';
      }
    };
  }

  /* ── Social distribution (Share Assist) ──────────────────────────────────────
     Turns any opportunity into a distribution asset: prepares the link, caption
     and a branded image card, then lets the owner share to LinkedIn/Facebook/X/
     Email/Instagram or copy the link. This is SHARE ASSIST — Pegasus prepares
     everything; the member confirms the post on the platform. No auto-posting,
     no fake "posted" messages. */
  var SHARE_ORIGIN='https://pegasuscapitalnetwork.com';
  function shareLoadImg(src){ return new Promise(function(res,rej){ var im=new Image(); im.onload=function(){res(im);}; im.onerror=function(){rej(new Error('img'));}; im.src=src; }); }
  function shareLoadImgCors(src){ return new Promise(function(res,rej){ var im=new Image(); im.crossOrigin='anonymous'; im.onload=function(){res(im);}; im.onerror=function(){rej(new Error('img'));}; im.src=src; }); }
  // The social asset sizes Pegasus generates from one presentation.
  var SHARE_FORMATS=[
    { key:'li',  label:'LinkedIn / Facebook / X', sub:'1200×630',  w:1200, h:630,  name:'link' },
    { key:'igp', label:'Instagram post',          sub:'1080×1350', w:1080, h:1350, name:'instagram-post' },
    { key:'igs', label:'Instagram story',         sub:'1080×1920', w:1080, h:1920, name:'instagram-story' },
    { key:'sq',  label:'Square',                  sub:'1080×1080', w:1080, h:1080, name:'square' }
  ];
  /* Branded share-asset generator. Adapts to any size; uses a Showcase cover
     image as a full-bleed background when one is provided (cross-origin Supabase
     URLs send CORS, so this works; if it ever taints, we fall back to the
     gradient). Only same-origin brand assets are required, so it never breaks.
     card: { eyebrow, title, subtitle, summary, url, coverUrl }
     opts: { w, h, name } */
  async function buildShareCard(card, opts){
    card=card||{}; opts=opts||{};
    var W=opts.w||1080, H=opts.h||1080;
    var cv=document.createElement('canvas'); cv.width=W; cv.height=H; var ctx=cv.getContext('2d');
    if(!ctx) throw new Error('no canvas');
    try{ if(document.fonts && document.fonts.ready) await document.fonts.ready; }catch(e){}
    var k=(W>H)?(H/1080):(Math.min(W,H)/1080); var pad=Math.round(64*k);
    var cover=null;
    if(card.coverUrl){ try{ cover=await shareLoadImgCors(card.coverUrl); }catch(e){ cover=null; } }
    if(cover){ try{ var s=Math.max(W/cover.width,H/cover.height), dw=cover.width*s, dh=cover.height*s; ctx.drawImage(cover, W/2-dw/2, H/2-dh/2, dw, dh); }catch(e){ cover=null; } }
    if(!cover){
      var g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#0B1626'); g.addColorStop(1,'#060B14'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      var rg=ctx.createRadialGradient(W/2,H*0.34,40,W/2,H*0.34,Math.max(W,H)*0.65); rg.addColorStop(0,'rgba(58,143,232,.16)'); rg.addColorStop(1,'rgba(58,143,232,0)'); ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
    } else {
      var sg=ctx.createLinearGradient(0,0,0,H); sg.addColorStop(0,'rgba(6,11,20,.55)'); sg.addColorStop(0.5,'rgba(6,11,20,.30)'); sg.addColorStop(1,'rgba(6,11,20,.94)'); ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
    }
    ctx.fillStyle='#3A8FE8'; ctx.fillRect(0,0,W,Math.max(5,Math.round(7*k)));
    var wmH=0;
    try{ var wm=await shareLoadImg('/assets/brand/pegasus-wordmark.png'); var ww=Math.round(220*k); var wh=ww*(wm.height/wm.width||0.18); ctx.globalAlpha=.95; ctx.drawImage(wm, pad, pad, ww, wh); ctx.globalAlpha=1; wmH=wh; }catch(e){}
    function wrap(text, font, maxW, maxLines){ ctx.font=font; var words=String(text||'').split(/\s+/), lines=[], cur=''; for(var i=0;i<words.length;i++){ var t=cur?cur+' '+words[i]:words[i]; if(ctx.measureText(t).width>maxW && cur){ lines.push(cur); cur=words[i]; } else cur=t; } if(cur) lines.push(cur); if(lines.length>maxLines){ lines=lines.slice(0,maxLines); lines[maxLines-1]=lines[maxLines-1].replace(/[\s\W]*$/,'')+'…'; } return lines; }
    var maxW=W-pad*2, blocks=[];
    if(card.eyebrow) blocks.push({lines:[String(card.eyebrow).toUpperCase()], font:'500 '+Math.round(26*k)+'px "IBM Plex Mono", monospace', fill:'#9FC1EA', lh:Math.round(36*k), gap:0});
    var tf=Math.round((W>H?52:64)*k);
    blocks.push({lines:wrap(card.title||'Opportunity','500 '+tf+'px "Cormorant Garamond", serif',maxW,(W>H?3:4)), font:'500 '+tf+'px "Cormorant Garamond", serif', fill:'#F6F9FC', lh:Math.round(tf*1.05), gap:Math.round(10*k)});
    if(card.subtitle) blocks.push({lines:[String(card.subtitle).slice(0,64)], font:'400 '+Math.round(30*k)+'px "IBM Plex Sans", sans-serif', fill:'#AFC4DC', lh:Math.round(40*k), gap:Math.round(14*k)});
    if(card.summary) blocks.push({lines:wrap(card.summary,'400 '+Math.round(26*k)+'px "IBM Plex Sans", sans-serif',maxW,2), font:'400 '+Math.round(26*k)+'px "IBM Plex Sans", sans-serif', fill:'#92A9C4', lh:Math.round(36*k), gap:Math.round(12*k)});
    var totalH=0; blocks.forEach(function(b){ totalH+=b.gap + b.lines.length*b.lh; });
    var urlGap=Math.round(80*k), blockBottom=H-pad-urlGap;
    var y=Math.max(pad+wmH+Math.round(30*k), blockBottom-totalH);
    ctx.textAlign='left'; ctx.textBaseline='top';
    blocks.forEach(function(b){ y+=b.gap; ctx.fillStyle=b.fill; ctx.font=b.font; b.lines.forEach(function(ln){ ctx.fillText(ln,pad,y); y+=b.lh; }); });
    ctx.fillStyle='#7FB0E6'; ctx.font='400 '+Math.round(25*k)+'px "IBM Plex Mono", monospace'; ctx.textBaseline='alphabetic';
    ctx.fillText(('pegasuscapitalnetwork.com'+(card.url||'')).slice(0,54), pad, H-pad);
    var blob=await new Promise(function(res,rej){ cv.toBlob(function(b){ b?res(b):rej(new Error('toBlob')); },'image/png',0.92); });
    var dataUrl=null; try{ dataUrl=cv.toDataURL('image/png'); }catch(e){}
    return { file:new File([blob],'pegasus-'+(opts.name||'card')+'.png',{type:'image/png'}), dataUrl:dataUrl, w:W, h:H };
  }
  function shareClip(text){ try{ if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); }catch(e){}
    try{ var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }catch(e){} return Promise.resolve(); }

  /* Share package modal. opts: { url, title, subtitle, badge, summary, caption,
     shortText, visibility, status, created, card:{...,coverUrl} } */
  function shareSheet(opts){
    opts=opts||{}; var url=opts.url||SHARE_ORIGIN; var caption=opts.caption||(opts.title+' — '+url);
    var shortText=opts.shortText||((opts.title||'Opportunity')+(opts.subtitle?(' — '+opts.subtitle):''));
    var vis=opts.visibility||'public_preview'; var status=opts.status||'active';
    var shareable=(status!=='archived' && vis!=='private');
    var sc='position:fixed;inset:0;background:rgba(8,12,18,.62);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:30px 18px;z-index:1000;overflow-y:auto';
    var bx='background:var(--bg);border:1px solid var(--border);border-radius:16px;width:100%;max-width:470px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.42)';
    var head = opts.created
      ? '<div style="font-family:var(--serif);font-size:22px;color:var(--text)">Published.</div><div style="font-size:13px;color:var(--text2);line-height:1.55;margin-top:6px">Your presentation is live inside Pegasus. Build it once — now share it everywhere to bring the right people back.</div>'
      : '<div style="font-family:var(--serif);font-size:21px;color:var(--text)">Share this presentation</div><div style="font-size:12.5px;color:var(--text3);line-height:1.5;margin-top:5px">Bring the right people back to Pegasus.</div>';
    var chip = '<div style="margin-top:14px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">'+
      (opts.badge?'<div style="font-size:8.5px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--blue-lt);margin-bottom:3px">'+esc(opts.badge)+'</div>':'')+
      '<div style="font-size:14px;font-weight:600;color:var(--text)">'+esc(opts.title||'Presentation')+'</div>'+
      (opts.subtitle?'<div style="font-size:11.5px;color:var(--text3);margin-top:1px">'+esc(opts.subtitle)+'</div>':'')+
      '<div style="font-size:11px;color:var(--text4);margin-top:5px;font-family:var(--mono);word-break:break-all">'+esc(url.replace(/^https?:\/\//,''))+'</div></div>';
    var lbl=function(t){ return '<div style="font-size:9px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin:16px 0 8px">'+t+'</div>'; };
    var body;
    if(status==='archived'){
      body='<div style="font-size:12.5px;color:var(--text3);margin-top:14px">This presentation is archived and can’t be shared. Make it active again to share it.</div><div style="margin-top:14px"><button class="btn btn-ghost" style="width:100%" id="shView">View presentation</button></div>';
    } else if(vis==='private'){
      body='<div style="font-size:12.5px;color:var(--gold);margin-top:14px;line-height:1.5">This presentation is private and cannot be publicly shared. Set its visibility to Public to share it outside Pegasus.</div><div style="display:flex;flex-direction:column;gap:9px;margin-top:14px"><button class="btn btn-ghost" id="shCopy">Copy link</button><button class="btn btn-ghost" id="shView">View presentation</button></div>';
    } else {
      var warn = vis==='member_only'
        ? '<div style="font-size:11.5px;color:var(--gold);line-height:1.5;margin-top:12px;padding:9px 11px;background:rgba(201,162,39,.10);border:1px solid rgba(201,162,39,.25);border-radius:9px">This is member-only. People outside Pegasus may see a locked preview or a sign-in prompt.</div>'
        : '';
      var imgBtns = SHARE_FORMATS.map(function(fmt,i){ return '<button class="btn btn-ghost btn-sm" id="shImg'+i+'" style="text-align:left;justify-content:flex-start">'+esc(fmt.label)+' <span style="color:var(--text4);font-family:var(--mono);font-size:9px;margin-left:4px">'+fmt.sub+'</span></button>'; }).join('');
      body=warn+
        lbl('Post to')+
        '<div style="display:flex;flex-direction:column;gap:8px"><button class="btn btn-pri" id="shLi">Share on LinkedIn</button>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-ghost" id="shFb">Facebook</button><button class="btn btn-ghost" id="shX">X</button></div>'+
        '<button class="btn btn-ghost" id="shEm">Share by Email</button></div>'+
        lbl('Share images')+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+imgBtns+'</div>'+
        '<div style="font-size:10.5px;color:var(--text4);margin-top:7px;line-height:1.45">On a phone these share straight to the app; on a computer they download so you can upload them.</div>'+
        lbl('Caption & link')+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-ghost btn-sm" id="shCap">Copy caption</button><button class="btn btn-ghost btn-sm" id="shShort">Copy short text</button></div>'+
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px"><button class="btn btn-ghost" id="shCopy">Copy link</button><button class="btn btn-ghost" id="shView">View presentation</button></div>';
    }
    modal('<div style="'+sc+'" onclick="if(event.target===this)Pegasus.dismissModal()"><div style="'+bx+'">'+
      '<div style="padding:20px 22px;border-bottom:1px solid var(--border)">'+head+'</div>'+
      '<div style="padding:8px 22px 20px;max-height:74vh;overflow-y:auto">'+chip+body+
        '<div style="font-size:10.5px;color:var(--text4);margin-top:14px;line-height:1.5">Pegasus prepares everything — you confirm the post on each platform. No automatic posting.</div>'+
      '</div>'+
    '</div></div>');

    function openWin(u){ window.open(u,'_blank','noopener,noreferrer'); }
    function on(id,fn){ var e=el(id); if(e) e.onclick=fn; }
    var u=encodeURIComponent(url), cap=encodeURIComponent(caption);
    on('shView', function(){ closeModal(); location.href=url; });
    on('shCopy', function(){ shareClip(url).then(function(){ toast('⧉','var(--green-dim)','Link copied', url.replace(/^https?:\/\//,'')); }); });
    on('shCap',  function(){ shareClip(caption).then(function(){ toast('⧉','var(--green-dim)','Caption copied','Paste it into your post.'); }); });
    on('shShort',function(){ shareClip(shortText+'\n'+url).then(function(){ toast('⧉','var(--green-dim)','Short text copied',''); }); });
    on('shLi', function(){ shareClip(caption).then(function(){ toast('⧉','var(--green-dim)','Caption copied','Paste it into your LinkedIn post.'); openWin('https://www.linkedin.com/sharing/share-offsite/?url='+u); }); });
    on('shFb', function(){ openWin('https://www.facebook.com/sharer/sharer.php?u='+u); });
    on('shX',  function(){ openWin('https://twitter.com/intent/tweet?text='+encodeURIComponent(shortText)+'&url='+u); });
    on('shEm', function(){ location.href='mailto:?subject='+encodeURIComponent((opts.title||'A presentation on Pegasus'))+'&body='+cap; });
    SHARE_FORMATS.forEach(function(fmt,i){ on('shImg'+i, function(){ shareImage(fmt); }); });
    async function shareImage(fmt){
      toast('◷','var(--blue-dim)','Preparing image','Building '+fmt.sub+'…');
      var img=null; try{ img=await buildShareCard(opts.card||{eyebrow:opts.badge,title:opts.title,subtitle:opts.subtitle,summary:opts.summary,url:''}, {w:fmt.w,h:fmt.h,name:fmt.name}); }
      catch(e){ console.warn('[share] image failed:',e); toast('!','var(--gold-dim)','Could not build image','Please try again.'); return; }
      var file=img.file;
      // Copy caption so it's ready to paste wherever they post.
      shareClip(caption);
      if(file && navigator.canShare && navigator.canShare({files:[file]})){
        try{ await navigator.share({ files:[file], title:opts.title, text:caption }); return; }
        catch(err){ if(err && err.name==='AbortError') return; }
      }
      if(img.dataUrl){ try{ var a=document.createElement('a'); a.href=img.dataUrl; a.download='pegasus-'+fmt.name+'.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }catch(e){} }
      toast('✓','var(--green-dim)','Image saved · caption copied', fmt.label+' ('+fmt.sub+')');
    }
  }
  /* High-level helper used by opportunity/business pages.
     opp: { title, slug, summary, visibility, status, media }
     opts: { businessName, badge, created } */
  function opportunityShare(opp, opts){
    opp=opp||{}; opts=opts||{};
    var path=opportunityPath(opp.slug); var url=SHARE_ORIGIN+path;
    var biz=opts.businessName||''; var badge=opts.badge||'Opportunity';
    var md=opp.media||{}; var cover=md.cover_url || (md.images && md.images[0] && md.images[0].url) || '';
    var caption='We just added a new presentation inside Pegasus Capital Network.\n\n'+
      (opp.title||'')+(biz?(' — presented by '+biz):'')+'.\n\n'+
      'Pegasus helps connect the right people through trusted visibility, business pages, opportunities, and curated introductions.\n\n'+
      'View it here:\n'+url;
    shareSheet({ url:url, title:opp.title, subtitle: biz?('Presented by '+biz):'', badge:badge,
      summary:opp.summary||'', caption:caption, shortText:(opp.title||'')+(biz?(' — '+biz):''),
      visibility:opp.visibility, status:opp.status, created:!!opts.created,
      card:{ eyebrow:badge, title:opp.title, subtitle: biz?('Presented by '+biz):'', summary:opp.summary||'', url:path, coverUrl:cover } });
  }

  /* ── Invite / referral — the growth loop's "bring your network" rung ──────────
     Surfaces the member's personal invite link (get_or_create_referral_code),
     shows how many joined through them, and lets them share it. The link is
     /signup.html?ref=CODE, which signup already captures and redeems; the
     referrer is notified on redemption. Backend already exists — this is the UI. */
  async function inviteOpen(){
    var c=null; try{ c=await window.PegSB.ready; }catch(e){ c=null; }
    var uid=null; if(c){ try{ var u=await c.auth.getUser(); uid=u&&u.data&&u.data.user&&u.data.user.id; }catch(e){} }
    if(!uid){ location.href='/signin.html'; return; }
    var sc='position:fixed;inset:0;background:rgba(8,12,18,.62);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:34px 18px;z-index:1000;overflow-y:auto';
    var bx='background:var(--bg);border:1px solid var(--border);border-radius:16px;width:100%;max-width:460px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.42)';
    modal('<div style="'+sc+'" onclick="if(event.target===this)Pegasus.closeModal()"><div style="'+bx+'">'+
      '<div style="padding:20px 22px;border-bottom:1px solid var(--border)"><div style="font-family:var(--serif);font-size:21px;color:var(--text)">Invite your network</div>'+
      '<div style="font-size:12.5px;color:var(--text3);line-height:1.5;margin-top:5px">Pegasus grows through the people you bring. Share your personal invite link — the right people join, and you see who did.</div></div>'+
      '<div id="peg-invite-body" style="padding:18px 22px"><div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Preparing your invite link…</div></div>'+
    '</div></div>');
    var code=null, joined=0;
    try{
      var r=await c.rpc('get_or_create_referral_code'); if(r && !r.error && r.data) code=r.data;
      var s=await c.rpc('my_referral_stats'); if(s && !s.error && s.data){ code=code||s.data.code; joined=s.data.joined||0; }
    }catch(e){ console.warn('[invite] rpc failed:', e); }
    var host=el('peg-invite-body'); if(!host) return;
    if(!code){
      host.innerHTML='<div style="font-size:13px;color:var(--gold);line-height:1.5">Your invite link isn’t ready yet. Please try again shortly.</div>'+
        '<div style="margin-top:14px"><button class="btn btn-ghost" onclick="Pegasus.closeModal()">Close</button></div>';
      return;
    }
    var link=SHARE_ORIGIN+'/signup.html?ref='+encodeURIComponent(code);
    var caption='I’m building my presence on Pegasus Capital Network — a professional network for capital, real estate, and business growth. Join me:\n'+link;
    var u=encodeURIComponent(link), cap=encodeURIComponent(caption);
    host.innerHTML=
      '<label style="display:block;font-size:11px;color:var(--text3);margin-bottom:5px">Your personal invite link</label>'+
      '<div style="display:flex;gap:8px"><input id="peg-invite-link" readonly value="'+esc(link)+'" onclick="this.select()" style="flex:1;min-width:0;padding:10px 11px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;font-family:var(--mono)">'+
      '<button class="btn btn-pri" id="peg-invite-copy">Copy</button></div>'+
      '<div style="font-size:11.5px;color:var(--text3);margin-top:8px">'+(joined>0?('<b style="color:var(--text)">'+joined+'</b> '+(joined===1?'person has':'people have')+' joined through you.'):'No one has joined yet — be the first to share it.')+'</div>'+
      '<div style="font-size:9px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin:16px 0 8px">Share</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px"><button class="btn btn-pri" id="peg-invite-li">Share on LinkedIn</button>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-ghost" id="peg-invite-fb">Facebook</button><button class="btn btn-ghost" id="peg-invite-x">X</button></div>'+
      '<button class="btn btn-ghost" id="peg-invite-em">Invite by Email</button></div>'+
      '<div style="font-size:10.5px;color:var(--text4);margin-top:12px;line-height:1.5">Anyone who signs up through your link is connected to you — and you’re notified when they join.</div>';
    function openWin(x){ window.open(x,'_blank','noopener,noreferrer'); }
    function on(id,fn){ var e=el(id); if(e) e.onclick=fn; }
    on('peg-invite-copy', function(){ shareClip(link).then(function(){ toast('⧉','var(--green-dim)','Invite link copied', link.replace(/^https?:\/\//,'')); }); });
    on('peg-invite-li', function(){ shareClip(caption).then(function(){ toast('⧉','var(--green-dim)','Message copied','Paste it into your LinkedIn post.'); openWin('https://www.linkedin.com/sharing/share-offsite/?url='+u); }); });
    on('peg-invite-fb', function(){ openWin('https://www.facebook.com/sharer/sharer.php?u='+u); });
    on('peg-invite-x', function(){ openWin('https://twitter.com/intent/tweet?text='+cap); });
    on('peg-invite-em', function(){ location.href='mailto:?subject='+encodeURIComponent('Join me on Pegasus Capital Network')+'&body='+cap; });
  }

  // notifications dropdown
  function toggleNotif(ev){ if(ev) ev.stopPropagation(); const p=el('notifPanel'); if(!p) return;
    if(p.innerHTML){ p.innerHTML=''; return; }
    const ns=Store.get().notifications||[];
    const ic={lender_interest:'◈',match_found:'◎',deal_room_update:'⟳',doc_requested:'📄',billing:'💳',admin_review:'⛨',ai_recommendation:'🧠',onboarding:'◷',connection_request:'⬡',connection_accepted:'✓'};
    p.innerHTML=`<div style="position:absolute;top:42px;right:0;width:320px;background:var(--bg1);border:1px solid var(--border2);border-radius:var(--r3);box-shadow:var(--sh-lift);z-index:400;overflow:hidden">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;font-weight:600">Notifications</span><span class="link" onclick="Pegasus.markNotifs()">Mark all read</span></div>
      <div style="max-height:360px;overflow-y:auto">${ns.length?ns.map(n=>`<a href="${safeUrl(n.link)}" style="display:flex;gap:11px;padding:12px 16px;border-bottom:1px solid var(--border);${n.read?'':'background:var(--bg2)'}"><span style="font-size:14px">${ic[n.kind]||'•'}</span><div><div style="font-size:12px;color:var(--text);font-weight:${n.read?'400':'600'}">${esc(n.title)}</div><div style="font-size:11px;color:var(--text3);line-height:1.4">${esc(n.body||'')}</div></div></a>`).join(''):'<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">No notifications</div>'}</div></div>`;
    document.addEventListener('click',function close(){ if(el('notifPanel'))el('notifPanel').innerHTML=''; document.removeEventListener('click',close); });
  }
  /* ── Profile slug helper ─────────────────────────────────────────────────── */
  function slugify(str){
    return (str||'').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'member';
  }
  /* Clean, shareable public path for a business/project/etc. presence.
     Maps presence_type → user-facing route segment. The internal resolver
     (presence.html?slug=) still works; users only ever see these clean URLs. */
  function presencePath(type, slug){
    if(!slug) return '/presence.html';
    var map={company:'business',capital_program:'business',fund:'fund',project:'project',showcase:'showcase',event:'event',property:'property'};
    var seg=map[type]||'business';
    return '/'+seg+'/'+encodeURIComponent(slug);
  }
  /* Clean, shareable public path for an opportunity (deal/listing/project).
     The internal resolver (opportunity.html?slug=) still works; users only
     ever see the clean /opportunity/<slug> URL. */
  function opportunityPath(slug){
    if(!slug) return '/opportunity.html';
    return '/opportunity/'+encodeURIComponent(slug);
  }
  /* Own public-profile path for in-app links (My Profile).
     Always points to the clean /u/{slug} route so /profile.html is never a
     primary destination. Falls back to /profile.html (a lightweight redirect
     bridge) only when no slug is known yet. */
  function ownProfilePath(){
    var slug='';
    try{ var st=Store.get(); if(st&&st.profile&&st.profile.profile_slug) slug=st.profile.profile_slug; }catch(e){}
    if(!slug){ try{ slug=localStorage.getItem('peg_slug')||''; }catch(e){} }
    if(slug) return '/u/'+slug;
    try{ var st2=Store.get(); if(st2&&st2.user&&st2.user.id&&st2.user.id!=='demo') return '/public-profile.html?id='+st2.user.id; }catch(e){}
    return '/profile.html';
  }
  /* Build the shareable public-profile URL for the current user.
     Prefers profile_slug; falls back to ?id=. */
  var CANONICAL_ORIGIN='https://pegasuscapitalnetwork.com';
  function profileUrl(){
    var st=Store.get(); var p=st.profile||{}; var u=st.user||{};
    /* Shareable public profile links always use the CANONICAL domain so links
     * are consistent and SEO-correct no matter which domain the member is on. */
    if(p.profile_slug) return CANONICAL_ORIGIN+'/u/'+p.profile_slug;
    if(u.id && u.id!=='demo') return CANONICAL_ORIGIN+'/public-profile.html?id='+u.id;
    return CANONICAL_ORIGIN+'/public-profile.html';
  }
  /* Copy the current user's public profile link to clipboard */
  function copyProfileLink(){
    var url=profileUrl();
    function done(){ toast('\u2713','var(--green-dim)','Link copied', url.replace(/^https?:\/\//,'')); }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(done).catch(function(){ fallbackCopy(url); done(); });
    } else { fallbackCopy(url); done(); }
  }
  function fallbackCopy(text){
    try{ var ta=document.createElement('textarea'); ta.value=text;
      ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }catch(e){}
  }
  /* ── Account dropdown menu ───────────────────────────────────────────────── */
  function toggleAccount(ev){
    if(ev) ev.stopPropagation();
    var m=el('acctMenu'); if(!m) return;
    if(m.innerHTML){ m.innerHTML=''; return; }
    var st=Store.get(); var isAdm = (typeof Store.isAdmin==='function') ? Store.isAdmin() : false;
    var p=st.profile||{}; var name=p.full_name||'My Account';
    var rows=[
      ['\u25CE','Network Feed','/feed'],
      ['\u25C8','Members Network','/members.html'],
      ['\u229E','Business Directory','/businesses'],
      ['\u25C9','My Profile',ownProfilePath()],
      ['\u270E','Manage Profile','/profile-edit.html'],
      ['\u25EB','Business Pages','/my-presences.html'],
      ['\u25C7','Financing Requests','/deal-requests.html'],
      ['\u25A6','My Workspace','/dashboard.html'],
      ['\u25A4','Access & Growth','/membership.html'],
    ];
    var adminRows=[];
    if(isAdm){
      adminRows.push(['\u26E8','Admin Console','/admin.html']);
      adminRows.push(['\u25C6','Capital Intelligence','/admin/intelligence']);
      adminRows.push(['\u25C6','Partner Network','/admin/partner-network']);
      adminRows.push(['\u25C7','Admin Requests','/admin-requests.html']);
      adminRows.push(['\u25C8','Admin Trust','/admin-trust-reviews.html']);
      adminRows.push(['\u25A3','Showcase Moderation','/showcase-admin.html']);
    } else if(p && p.pci_role==='analyst'){
      /* Capital Intelligence analyst \u2014 read + manual property/lender editing. */
      adminRows.push(['\u25C6','Capital Intelligence','/admin/intelligence']);
    }
    m.innerHTML='<div class="acct-menu">'
      + '<div class="acct-head" style="padding:11px 14px 9px;border-bottom:1px solid var(--border)"><div style="font-size:13px;font-weight:600;color:var(--text)">'+esc(name)+'</div><div style="font-size:11px;color:var(--text3)">'+esc((st.user&&st.user.email)||p.email||'')+'</div></div>'
      + rows.map(function(r){return '<a class="acct-item" href="'+r[2]+'"><span class="acct-ic">'+r[0]+'</span>'+r[1]+'</a>';}).join('')
      + (adminRows.length
          ? '<div class="acct-sep"></div><div class="acct-label" style="padding:7px 14px 3px;font-size:9px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text3)">Admin</div>'
            + adminRows.map(function(r){return '<a class="acct-item" href="'+r[2]+'"><span class="acct-ic">'+r[0]+'</span>'+r[1]+'</a>';}).join('')
          : '')
      + '<div class="acct-sep"></div>'
      + '<button class="acct-item acct-out" onclick="PegAuth.signOut()"><span class="acct-ic">\u23FB</span>Sign Out</button>'
      + '</div>';
    document.addEventListener('click', function close(){ if(el('acctMenu')) el('acctMenu').innerHTML=''; document.removeEventListener('click',close); });
  }

  async function markNotifs(){ await window.PegAPI.markAllRead(); const p=el('notifPanel'); if(p)p.innerHTML=''; }

  /* Async: check if user is already logged in on public pages.
     If yes → replace nav CTAs and hero button with dashboard links.
     Runs silently after page load — no flash, no layout shift.    */
  /* Synchronously detect login from Supabase's stored session (storageKey: pegasus.auth).
     Far more reliable than getSession() which can race with client init.        */
  function pegHasSession() {
    /* Primary: check the hydrated Store — most reliable since boot() hydrates
       before mountPublic runs. mode==='live' means a real authenticated user. */
    try {
      var st = Store.get();
      if (st && st.mode === 'live' && st.user && st.user.id !== 'demo') return true;
    } catch(e) {}
    /* Fallback: check Supabase's stored session token in localStorage */
    try {
      var raw = localStorage.getItem('pegasus.auth');
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      var tok = parsed && (parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token));
      return !!tok;
    } catch(e) { return false; }
  }

  function pegStoreSlug() {
    /* Get slug from Store if available, else cached value */
    try {
      var st = Store.get();
      if (st && st.profile && st.profile.profile_slug) return st.profile.profile_slug;
    } catch(e) {}
    try { return localStorage.getItem('peg_slug') || ''; } catch(e) { return ''; }
  }

  function pegApplyAuthedNav() {
    var loggedIn = pegHasSession();
    var ctaEl = document.getElementById('pub-nav-cta');
    var slug = pegStoreSlug();
    if (slug) { try { localStorage.setItem('peg_slug', slug); } catch(_) {} }

    if (!loggedIn) {
      /* Not logged in — show default Sign In / Create Profile */
      if (ctaEl) ctaEl.style.visibility = '';
      return;
    }

    /* Logged in — replace CTA */
    if (ctaEl) {
      var onProfile = window.location.pathname.indexOf('/u/') === 0 ||
                      window.location.pathname.indexOf('/public-profile') >= 0;
      if (onProfile && window.__PEG_OWNER_NAV) {
        /* Owner viewing their own profile \u2014 a single Manage Profile dropdown
           replaces the old 3 buttons. Menu actions are defined by the profile
           page (window.ppToggleManage / window.ppShare). */
        ctaEl.innerHTML =
          '<div class="pp-manage" id="ppManage" style="position:relative;margin:0">'+
            '<button class="btn btn-pri nav-create" onclick="window.ppToggleManage&&window.ppToggleManage()">Manage Profile \u25BE</button>'+
            '<div class="pp-manage-menu" id="ppManageMenu">'+
              '<div class="pp-manage-label">Profile</div>'+
              '<a class="pp-manage-item" href="/profile-edit.html">Edit Profile</a>'+
              '<button class="pp-manage-item" onclick="Pegasus.copyProfileLink()">Copy Profile Link</button>'+
              '<div class="pp-manage-label">Share</div>'+
              '<button class="pp-manage-item" onclick="window.ppShare&&ppShare(\'linkedin\')">Share to LinkedIn</button>'+
              '<button class="pp-manage-item" onclick="window.ppShare&&ppShare(\'facebook\')">Share to Facebook</button>'+
              '<button class="pp-manage-item" onclick="window.ppShare&&ppShare(\'x\')">Share to X</button>'+
              '<button class="pp-manage-item" onclick="window.ppShare&&ppShare(\'instagram\')">Share on Instagram</button>'+
              '<button class="pp-manage-item" onclick="window.ppShare&&ppShare(\'email\')">Share by Email</button>'+
              '<div class="pp-manage-label">Business</div>'+
              '<a class="pp-manage-item" href="/my-presences.html">Manage Businesses</a>'+
              '<div class="pp-manage-label">Grow</div>'+
              '<button class="pp-manage-item" onclick="Pegasus.inviteOpen&&Pegasus.inviteOpen()">Invite to Pegasus</button>'+
              '<div class="pp-manage-label">Workspace</div>'+
              '<a class="pp-manage-item" href="/dashboard.html">My Workspace</a>'+
            '</div>'+
          '</div>';
      } else {
        ctaEl.innerHTML =
          (slug ? '<a class="btn btn-ghost" href="/u/'+slug+'" style="font-size:13px">My Profile</a>' : '') +
          '<a class="btn btn-pri nav-create" href="/dashboard.html">My Workspace \u2192</a>';
      }
      ctaEl.style.visibility = '';
    }

    /* Replace public marketing links with member navigation. Logged-in members
       should never see the anonymous marketing nav. Done once (idempotent). */
    var links = document.querySelector('.pub-links');
    if (links && links.getAttribute('data-member') !== '1') {
      links.setAttribute('data-member', '1');
      var on = function(p){ return location.pathname.indexOf(p) === 0 ? ' on' : ''; };
      links.innerHTML =
        '<a class="member'+on('/people')+'" href="/people">People</a>'+
        '<a class="member'+on('/businesses')+'" href="/businesses">Businesses</a>'+
        '<a class="member'+on('/showcase')+'" href="/showcase.html">Opportunities</a>'+
        '<a class="member'+on('/events')+'" href="/events">Events</a>'+
        '<a class="member'+on('/dashboard')+'" href="/dashboard.html">My Workspace</a>'+
        '<a class="member'+(slug?on('/u/'):'')+'" href="'+(slug?'/u/'+slug:'/profile.html')+'">My Profile</a>';
    }
    /* Mobile drawer → member links too */
    var mdn = document.getElementById('mobDrawerNav');
    if (mdn && mdn.getAttribute('data-member') !== '1') {
      mdn.setAttribute('data-member', '1');
      mdn.innerHTML =
        '<a href="/people">People</a>'+
        '<a href="/businesses">Businesses</a>'+
        '<a href="/showcase.html">Opportunities</a>'+
        '<a href="/events">Events</a>'+
        '<a href="/dashboard.html">My Workspace</a>'+
        '<a href="'+(slug?'/u/'+slug:'/profile.html')+'">My Profile</a>'+
        '<div class="mob-sec">Account</div>'+
        '<a href="/my-presences.html">Business Pages</a>'+
        '<a href="/feed">Feed</a>'+
        '<a href="/deal-requests.html">Financing Requests</a>'+
        '<a href="/membership.html">Access & Growth</a>'+
        '<a href="/profile-edit.html">Manage Profile</a>'+
        '<a href="/share-studio.html">Share Studio</a>';
    }
    var mdf = document.getElementById('mobDrawerFoot');
    if (mdf && mdf.getAttribute('data-member') !== '1') {
      mdf.setAttribute('data-member', '1');
      mdf.innerHTML = '<button class="btn btn-ghost" style="width:100%" onclick="PegAuth.signOut()">Sign Out</button>';
    }

    /* Swap hero "Create My Profile" → "Open My Dashboard" */
    document.querySelectorAll('a[href="/signup.html"].btn-pri, a[href="/signup.html"].hero-cta-pri').forEach(function(btn){
      btn.textContent = 'Open My Workspace \u2192';
      btn.href = '/dashboard.html';
    });
  }

  async function updateNavForAuth() {
    /* Synchronous fast-path using stored session */
    pegApplyAuthedNav();

    /* Async: confirm session + cache the slug for next-page fast-path */
    try {
      var sb = await window.PegSB.ready;
      var { data: { session } } = await sb.auth.getSession();
      if (!session) {
        try { localStorage.removeItem('peg_authed'); localStorage.removeItem('peg_slug'); } catch(_) {}
        var ctaEl2 = document.getElementById('pub-nav-cta');
        if (ctaEl2) ctaEl2.style.visibility = '';
        return;
      }
      localStorage.setItem('peg_authed', '1');
      /* Fetch + cache slug so My Profile links work on next page immediately */
      var pr = await sb.from('profiles').select('profile_slug').eq('id', session.user.id).maybeSingle();
      if (pr.data && pr.data.profile_slug) {
        localStorage.setItem('peg_slug', pr.data.profile_slug);
      }
      /* Re-apply now that we have fresh slug */
      pegApplyAuthedNav();
    } catch(e) { /* silent */ }
  }

    window.Pegasus = {
    boot,
    get session(){ return sessionProxy(); },
    tier:()=>Store.get().tier, meta:T, limit:lim, store:Store,
    fmt, toast, esc, safeUrl, mountApp, mountPublic, publicNav, footer, modal, closeModal, dismissModal, clearDraft, clearModalFields, modalDirty, guardUnsaved,
    toggleNotif, markNotifs, toggleAccount, copyProfileLink, profileUrl, ownProfilePath, slugify, presencePath, opportunityPath, engageOpen, shareSheet, opportunityShare, buildShareCard, inviteOpen,
    refreshNav: pegApplyAuthedNav,
    setTier(t){ Store.set({tier:t}); },
  };
})();


/* ── High-signal field counters: auto-attach to [data-count][maxlength] ── */
(function(){
  function render(el){
    var max=parseInt(el.getAttribute('maxlength')||'0',10); if(!max) return;
    var c=el.__pc; if(!c) return;
    var len=(el.value||'').length;
    c.textContent=len+' / '+max;
    c.style.color = len>=max ? 'var(--amber)' : (len>max*0.9 ? 'var(--amber)' : 'var(--text4)');
  }
  function attach(el){
    if(el.__pcDone) return; el.__pcDone=1;
    var c=document.createElement('div'); c.className='peg-charcount'; el.__pc=c;
    if(el.parentNode) el.parentNode.appendChild(c);
    el.addEventListener('input',function(){render(el);});
    render(el);
  }
  function scan(root){ try{(root||document).querySelectorAll('[data-count][maxlength]').forEach(attach);}catch(e){} }
  function init(){
    scan(document);
    try{ new MutationObserver(function(muts){
      muts.forEach(function(m){ if(m.addedNodes) m.addedNodes.forEach(function(n){ if(n.nodeType===1){ scan(n); } }); });
    }).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  }
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded',init);
})();

/* ── Native spell-check on free-text form fields ─────────────────────────────
   Enables the browser's built-in spell checker on text inputs and textareas
   (red squiggly underlines). Skips fields where spell-check is wrong: email,
   url, password, number, tel, search, and fields opting out via
   data-nospell. Applies on load AND to dynamically-rendered forms. */
(function(){
  'use strict';
  var SKIP_TYPES = {email:1,url:1,password:1,number:1,tel:1,search:1,date:1,time:1,'datetime-local':1,month:1,week:1,color:1,range:1,file:1,hidden:1,checkbox:1,radio:1};
  function applyOne(el){
    if(el.__spDone) return; el.__spDone=1;
    var tag=el.tagName;
    if(tag==='TEXTAREA'){ el.setAttribute('spellcheck','true'); return; }
    if(tag==='INPUT'){
      var t=(el.getAttribute('type')||'text').toLowerCase();
      if(SKIP_TYPES[t]) { el.setAttribute('spellcheck','false'); return; }
      if(el.hasAttribute('data-nospell')) { el.setAttribute('spellcheck','false'); return; }
      el.setAttribute('spellcheck','true');
    }
  }
  function scanSP(root){ try{(root||document).querySelectorAll('input,textarea').forEach(applyOne);}catch(e){} }
  function initSP(){
    scanSP(document);
    try{ new MutationObserver(function(muts){
      muts.forEach(function(m){ if(m.addedNodes) m.addedNodes.forEach(function(n){ if(n.nodeType===1){ if(n.matches&&(n.matches('input,textarea'))) applyOne(n); scanSP(n); } }); });
    }).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  }
  if(document.readyState!=='loading') initSP(); else document.addEventListener('DOMContentLoaded',initSP);
})();

/* ── A11y: make onclick-only elements keyboard-operable ──────────────────────
   The app builds many interactive <div>/<span> via innerHTML with onclick but
   no role/tabindex/keyboard support (WCAG 2.1.1 / 4.1.2). This makes every such
   element focusable, announces it as a button, and activates it on Enter/Space —
   without changing markup or visuals. Applies on load and to dynamic DOM. */
(function(){
  'use strict';
  var NATIVE={A:1,BUTTON:1,INPUT:1,SELECT:1,TEXTAREA:1,SUMMARY:1,LABEL:1};
  function enhance(el){
    try{
      if(el.__a11yBtn) return; el.__a11yBtn=1;
      if(NATIVE[el.tagName]) return;
      if(!el.hasAttribute('onclick')) return;
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
      if(!el.hasAttribute('role')) el.setAttribute('role','button');
    }catch(e){}
  }
  function scan(root){ try{(root||document).querySelectorAll('[onclick]').forEach(enhance);}catch(e){} }
  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter' && e.key!==' ' && e.key!=='Spacebar') return;
    var t=e.target;
    if(!t || NATIVE[t.tagName] || !t.getAttribute) return;
    if(t.getAttribute('role')==='button' && t.hasAttribute('onclick')){
      e.preventDefault();
      if(typeof t.click==='function') t.click();
    }
  });
  function initA(){
    scan(document);
    try{ new MutationObserver(function(muts){
      muts.forEach(function(m){ if(m.addedNodes) m.addedNodes.forEach(function(n){ if(n.nodeType===1){ if(n.matches&&n.matches('[onclick]')) enhance(n); scan(n); } }); });
    }).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  }
  if(document.readyState!=='loading') initA(); else document.addEventListener('DOMContentLoaded',initA);
})();

/* ── Ask Pegasus — global floating assistant ─────────────────────────────────
   A site-wide guide that appears bottom-right on every product/marketing page.
   It is a *guide*, not an agent: it answers "how do I…" questions with short
   help text and safe links. It has NO destructive powers — it never deletes
   users, changes billing, or alters privacy. Anonymous visitors are guided to
   create a profile / sign in; signed-in members get how-tos for profile,
   business pages, opportunities, showcases, Share Studio, requests & workspace.
   Skipped on auth screens and the full assistant page to avoid duplication. */
(function(){
  'use strict';
  var path=(location.pathname||'').toLowerCase();
  var SKIP=['/signin','/signup','/auth-callback','/reset-password','/forgot-password','/ai-assistant'];
  for(var i=0;i<SKIP.length;i++){ if(path.indexOf(SKIP[i])===0) return; }

  function authed(){
    try{
      var raw=localStorage.getItem('pegasus.auth'); if(!raw) return false;
      var pj=JSON.parse(raw);
      return !!(pj && (pj.access_token||(pj.currentSession&&pj.currentSession.access_token)));
    }catch(e){ return false; }
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var QA_ANON=[
    {q:'What is Pegasus?', a:'Pegasus is a professional capital network. You create a profile, connect your business pages, present opportunities and showcases, share them outside Pegasus, and receive interest from the right people.', cta:['Create Free Profile','/signup.html']},
    {q:'Why should I create a profile?', a:'People cannot connect with what they cannot see. A profile makes who you are, what you represent, and what you offer visible to the right people.', cta:['Create Free Profile','/signup.html']},
    {q:'Is it free to join?', a:'Yes — free to enter. You can create a profile, connect your first business page, present initial opportunities or showcases, share them, and receive interest. Growth access unlocks more later.', cta:['See Access & Growth','/membership.html']},
    {q:'How does Pegasus work?', a:'Personal profile = trust. Business page = promotion. Opportunity / showcase = presentation. Then share outside Pegasus and receive interest.', cta:['How It Works','/explore.html']},
    {q:'I already have an account', a:'Welcome back — sign in to open your workspace and profile.', cta:['Sign In','/signin.html']}
  ];
  var QA_MEMBER=[
    {q:'What should I do next?', a:'Build your presence: complete your profile, add a business page, add social links, then publish an opportunity or showcase you can share.', cta:['Open Workspace','/dashboard.html']},
    {q:'How do I create a business page?', a:'Open Business Pages and choose Create Free Business Page. Describe what you do, what you offer, and who should connect.', cta:['Business Pages','/my-presences.html']},
    {q:'How do I present an opportunity or showcase?', a:'Use the Presentation Builder: choose a format (capital program, project, property, startup need, showcase, event or partnership), build it, preview and publish.', cta:['Opportunities & Showcases','/showcase.html']},
    {q:'How do I upload photos to a Showcase?', a:'Open the showcase, then add a cover image, gallery photos and an optional video URL in the media section of the Presentation Builder.', cta:['Opportunities & Showcases','/showcase.html']},
    {q:'How do I share to Instagram / social?', a:'Open Share Studio (or the Share button on any profile, business or opportunity). Pegasus prepares Instagram-ready images and a caption — download the image and copy the caption, then post. No auto-posting yet.', cta:['Share Studio','/share-studio.html']},
    {q:'Where are my requests?', a:'Interest people send you appears under Requests in your workspace.', cta:['Requests','/network-requests.html']},
    {q:'What is the difference between a Business Page and a Showcase?', a:'A Business Page promotes what a business does and who should connect. A Showcase is a specific presentation — a project, listing, program or proof — that you share to bring people back.', cta:['Business Pages','/my-presences.html']},
    {q:'What does Reviewed status mean?', a:'Reviewed status is a trust signal. It shows your identity and credentials were checked, which improves visibility. Apply from Trust / Reviewed Status.', cta:['Trust / Reviewed Status','/apply-review.html']}
  ];

  var open=false;
  function panelHTML(){
    var list=authed()?QA_MEMBER:QA_ANON;
    var rows=list.map(function(item,idx){
      return '<button class="peg-ask-q" data-i="'+idx+'" style="display:block;width:100%;text-align:left;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.92);padding:10px 13px;border-radius:10px;margin-bottom:7px;cursor:pointer;font-size:12.5px;line-height:1.4;transition:all .15s">'+esc(item.q)+'</button>';
    }).join('');
    return '<div id="pegAskPanel" role="dialog" aria-label="Ask Pegasus assistant" style="position:fixed;bottom:84px;right:20px;width:360px;max-width:calc(100vw - 32px);background:linear-gradient(180deg,#0E1E36,#091420);border:1px solid rgba(255,255,255,.10);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04);z-index:1200;overflow:hidden;font-family:\'IBM Plex Sans\',system-ui,sans-serif;animation:pegAskIn .25s cubic-bezier(.16,1,.3,1)">'+
      '<style>@keyframes pegAskIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}.peg-ask-q:hover{background:rgba(255,255,255,.08)!important;border-color:rgba(29,90,158,.35)!important}</style>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">'+
        '<div style="display:flex;align-items:center;gap:10px"><span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,rgba(29,90,158,.35),rgba(29,90,158,.18));color:#92B8F0;font-size:14px;border:1px solid rgba(29,90,158,.25)">✦</span><div><div style="font-size:13.5px;font-weight:600;color:rgba(255,255,255,.95);letter-spacing:-.01em">Ask Pegasus</div><div style="font-size:10px;font-family:\'IBM Plex Mono\',monospace;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.38);margin-top:1px">Network Concierge</div></div></div>'+
        '<button id="pegAskClose" aria-label="Close" style="border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);width:28px;height:28px;border-radius:8px;cursor:pointer;transition:all .15s;font-size:12px">✕</button>'+
      '</div>'+
      '<div id="pegAskBody" style="padding:16px 18px;max-height:60vh;overflow-y:auto">'+
        '<div style="font-size:10px;font-family:\'IBM Plex Mono\',monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.32);margin-bottom:12px">'+(authed()?'How can I help?':'Getting started')+'</div>'+
        rows+
      '</div>'+
      '<div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.15)"><a href="/ai-assistant.html" style="display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,.5);text-decoration:none;transition:color .15s"><span style="font-size:10px">✦</span> Full Capital Assistant</a></div>'+
    '</div>';
  }
  function answerHTML(item){
    var cta=item.cta?'<a href="'+item.cta[1]+'" style="display:inline-flex;align-items:center;gap:5px;margin-top:14px;background:linear-gradient(135deg,#1D5A9E,#1b4f8c);color:#fff;padding:9px 16px;border-radius:10px;font-size:12px;font-weight:500;text-decoration:none;transition:all .15s;box-shadow:0 2px 8px rgba(29,90,158,.25)">'+esc(item.cta[0])+' <span style="font-size:10px">→</span></a>':'';
    return '<button id="pegAskBack" style="border:none;background:none;color:#92B8F0;cursor:pointer;font-size:11px;font-family:\'IBM Plex Mono\',monospace;letter-spacing:.04em;padding:0;margin-bottom:12px">‹ Back</button>'+
      '<div style="font-size:13.5px;font-weight:600;color:rgba(255,255,255,.95);margin-bottom:8px;letter-spacing:-.01em">'+esc(item.q)+'</div>'+
      '<div style="font-size:12.5px;color:rgba(255,255,255,.62);line-height:1.6">'+esc(item.a)+'</div>'+cta;
  }
  function render(){
    var existing=document.getElementById('pegAskPanel'); if(existing) existing.remove();
    if(!open) return;
    document.body.insertAdjacentHTML('beforeend', panelHTML());
    var panel=document.getElementById('pegAskPanel');
    var list=authed()?QA_MEMBER:QA_ANON;
    panel.querySelector('#pegAskClose').onclick=toggle;
    panel.querySelectorAll('.peg-ask-q').forEach(function(b){
      b.onclick=function(){
        var item=list[+b.getAttribute('data-i')];
        var body=panel.querySelector('#pegAskBody');
        body.innerHTML=answerHTML(item);
        var back=body.querySelector('#pegAskBack'); if(back) back.onclick=function(){ open=true; render(); };
      };
    });
  }
  function toggle(){ open=!open; render();
    var fab=document.getElementById('pegAskFab'); if(fab) fab.setAttribute('aria-expanded',open?'true':'false');
  }
  function mount(){
    if(document.getElementById('pegAskFab')) return;
    var fab=document.createElement('button');
    fab.id='pegAskFab';
    fab.setAttribute('aria-label','Ask Pegasus — open assistant');
    fab.setAttribute('aria-expanded','false');
    fab.title='Ask Pegasus';
    fab.innerHTML='<span aria-hidden="true" style="font-size:15px">✦</span><span class="peg-ask-fab-lbl">Ask Pegasus</span>';
    fab.style.cssText='position:fixed;bottom:20px;right:20px;z-index:1199;display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 20px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:linear-gradient(135deg,#1D5A9E,#162E52);color:rgba(255,255,255,.95);font-family:\'IBM Plex Sans\',system-ui,sans-serif;font-size:13px;font-weight:600;letter-spacing:-.01em;cursor:pointer;box-shadow:0 8px 24px rgba(10,20,32,.45),0 0 0 1px rgba(255,255,255,.04);transition:all .25s cubic-bezier(.16,1,.3,1)';
    fab.onclick=toggle;
    document.body.appendChild(fab);
    /* avoid overlapping the mobile tab bar */
    var mq=window.matchMedia('(max-width:720px)');
    function adapt(){ var lbl=fab.querySelector('.peg-ask-fab-lbl'); if(!lbl) return;
      if(mq.matches){ lbl.style.display='none'; fab.style.padding='0'; fab.style.width='46px'; fab.style.justifyContent='center'; fab.style.bottom='74px'; }
      else { lbl.style.display=''; fab.style.padding='0 18px'; fab.style.width=''; fab.style.bottom='20px'; } }
    adapt(); try{ mq.addEventListener('change',adapt); }catch(e){ try{ mq.addListener(adapt); }catch(_){} }
    document.addEventListener('keydown',function(e){ if(e.key==='Escape' && open) toggle(); });
  }
  if(document.readyState!=='loading') mount(); else document.addEventListener('DOMContentLoaded',mount);
})();
