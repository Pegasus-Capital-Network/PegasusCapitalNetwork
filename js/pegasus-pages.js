/* ============================================================================
   PEGASUS v69 — Content page renderers (marketing, legal, faq, directory,
   profile, form). All consume PEG_CONTENT + the shared design system.
   ============================================================================ */
(function(){
  const P=window.Pegasus, C=window.PEG_CONTENT||{};
  const ICONS=['◈','◎','◆','⬢','▦','◉','⟡','✦'];
  const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');

  function hero(key,opts={}){
    const d=C[key]||{}; const _ACR={rwa:'RWA',llc:'LLC',usa:'USA',api:'API',faq:'FAQ',seo:'SEO',cta:'CTA',ai:'AI',crm:'CRM',rfp:'RFP'};const titleCase=k=>String(k).split(/[-_]/).map(w=>w?(_ACR[w.toLowerCase()]||w[0].toUpperCase()+w.slice(1)):'').join(' ');
    const cleanH1=(String(d.h1||'').replace(/^["'>\s]+/,''));
    const h1=opts.h1||cleanH1||titleCase(key);
    const rawLead=d.lead||''; const safeLead=(/\n/.test(rawLead)||rawLead.length>360)?'':rawLead;
    const lead=opts.lead||safeLead||'';
    const ctas=opts.ctas||[['Join the Network','signup.html','btn-pri'],['How It Works','how-it-works.html','btn-ghost']];
    return `<section class="page-hero"><div class="page-hero-in">
      ${opts.eyebrow?`<div class="eyebrow">${opts.eyebrow}</div>`:''}
      <h1>${esc(h1)}</h1><p class="page-lead">${esc(lead)}</p>
      <div class="hero-cta">${ctas.map(c=>`<a class="btn btn-lg ${c[2]}" href="${c[1]}">${c[0]}</a>`).join('')}</div>
    </div></section>`;
  }
  function deriveTitle(p){ // short title from a paragraph's first clause
    let t=(p||'').split(/[.!?:—-]/)[0].trim().split(/\s+/).slice(0,5).join(' ');
    return t.length>3?t:(p||'').slice(0,40);
  }
  function featGrid(key,opts={}){
    const d=C[key]||{}; let cards=opts.cards||d.cards||[]; const paras=d.paras||[];
    if(!cards.length && paras.length) cards=paras.slice(0,6).map(deriveTitle); // synthesize from copy
    if(!cards.length) return '';
    const cols=cards.length%3===0?'c3':cards.length===4?'c2':'c3';
    return `<div class="section"><div class="eyebrow">${opts.eyebrow||'Overview'}</div><h2 class="h2">${opts.title||'What you get'}</h2>
      <div class="feat-grid ${cols}">${cards.map((t,i)=>`<div class="feat"><div class="feat-ic">${ICONS[i%ICONS.length]}</div><div class="feat-n">0${i+1}</div><div class="feat-t">${esc(t)}</div><div class="feat-d">${esc(paras[i]||paras[i%Math.max(1,paras.length)]||'')}</div></div>`).join('')}</div></div>`;
  }
  function steps(key,opts={}){
    const d=C[key]||{}; const cards=(opts.cards||d.cards||[]).slice(0,6); const paras=d.paras||[];
    if(!cards.length) return '';
    return `<div class="section section-tight"><div class="eyebrow">${opts.eyebrow||'Process'}</div><h2 class="h2">${opts.title||'How it works'}</h2>
      <div class="steps">${cards.map((t,i)=>`<div class="step"><div class="step-num"></div><div><div class="step-t">${esc(t)}</div><div class="step-d">${esc(paras[i]||'')}</div></div></div>`).join('')}</div></div>`;
  }
  function cta(opts={}){
    return `<div class="cta-band"><h2>${opts.h2||'Ready to join the network?'}</h2><p>${opts.p||'Membership starts with a 30-day trial. Connect with verified capital-market professionals.'}</p>
      <div class="hero-cta" style="justify-content:center"><a class="btn btn-pri btn-lg" href="${opts.href||'/signup.html'}">${opts.btn||'Create Account →'}</a><a class="btn btn-ghost btn-lg" href="/membership.html">View Pricing</a></div></div>`;
  }
  function legal(key){
    const d=C[key]||{}; const paras=[d.lead,...(d.paras||[])].filter(Boolean);
    return `<div class="page-hero" style="padding:48px 40px 32px"><div class="page-hero-in"><div class="eyebrow">Legal</div><h1 style="font-size:34px">${esc(d.h1||key)}</h1></div></div>
      <div class="legal-doc"><div class="legal-meta">Last updated · 2026 · Pegasus Lenders Group LLC</div>
      ${paras.map((p,i)=>i>0&&p.length<80?`<h2>${esc(p)}</h2>`:`<p>${esc(p)}</p>`).join('')}
      <p style="margin-top:24px;color:var(--text3)">This summary is provided for convenience and does not constitute legal advice. Pegasus is a membership marketplace platform — not a lender, MLO, broker-dealer, real estate broker, or investment advisor. Consult a licensed professional.</p></div>`;
  }
  function faq(key){
    const d=C[key]||{}; const ps=(d.paras||[]);
    // pair: short para = question, next = answer; fallback synth from leads
    const items=[]; for(let i=0;i<ps.length;i++){ if(ps[i].length<120 && ps[i].endsWith('?')){ items.push([ps[i],ps[i+1]||'']); i++; } }
    const fallback=[['What is Pegasus Network?','A compliance-first membership marketplace connecting Growth Partners, lenders, brokers, agents, and capital partners across structured real estate finance.'],['Is Pegasus a lender or broker?','No. Pegasus is a membership marketplace platform — not a lender, MLO, broker-dealer, real estate broker, or investment advisor. All connections are member-directed.'],['How does matching work?','The Pegasus Match Engine scores Growth Partner deal profiles against lender appetite to surface Capital Alignment, Deal Strength, and Funding Probability — informational signals only.'],['What does membership cost?','Three access layers: Starter $20/mo, Pro $50/mo, and Gold $100/mo, each starting with a 30-day trial.'],['Who can join?','Verified capital-market professionals: Growth Partners, private lenders, mortgage brokers, real estate and insurance agents, RWA partners, and business funding providers.']];
    const list=(items.length?items:fallback);
    return `${hero(key,{eyebrow:'Support',ctas:[['Contact Us','contact.html','btn-pri'],['Browse Pricing','membership.html','btn-ghost']]})}
      <div class="section section-tight"><div id="faqList">${list.map(([q,a])=>`<div class="faq-item"><div class="faq-q" onclick="this.parentElement.classList.toggle('open')">${esc(q)}<span class="faq-x">+</span></div><div class="faq-a">${esc(a)}</div></div>`).join('')}</div></div>`;
  }
  // generic marketing assembler
  function ecoHero(key,opts={}){
    const d=C[key]||{}; const _ACR={rwa:'RWA',llc:'LLC',usa:'USA',api:'API',faq:'FAQ',seo:'SEO',cta:'CTA',ai:'AI',crm:'CRM',rfp:'RFP'};const titleCase=k=>String(k).split(/[-_]/).map(w=>w?(_ACR[w.toLowerCase()]||w[0].toUpperCase()+w.slice(1)):'').join(' ');
    const cleanH1=(String(d.h1||'').replace(/^["'>\s]+/,''));
    const h1=opts.h1||cleanH1||titleCase(key);
    const rawLead=d.lead||''; const lead=opts.lead||((/\n/.test(rawLead))?'':rawLead)||'';
    const ctas=opts.ctas||[['Create Your Free Account →','/signup.html','btn-pri'],['Browse the Network →','/members.html','btn-browse']];
    return `<section class="eco-hero">
      <canvas id="cinCanvas" class="eco-canvas"></canvas>
      <div class="cin-signals" id="cinSignals" aria-hidden="true"></div>
      <div class="eco-hero-in">
      ${opts.eyebrow?`<div class="eco-eyebrow">${esc(opts.eyebrow)}</div>`:''}
      <h1>${esc(h1)}</h1>${lead?`<p>${esc(lead)}</p>`:''}
      <div class="eco-cta">${ctas.map(c=>`<a class="btn btn-lg ${c[2]}" href="${c[1]}">${c[0]}</a>`).join('')}</div>
    </div></section>`;
  }
  function ecoBody(key,opts={}){
    const d=C[key]||{}; let cards=opts.cards||d.cards||[]; const paras=d.paras||[];
    if(!cards.length && paras.length) cards=paras.slice(0,6).map(deriveTitle);
    if(!cards.length) return '';
    return `<section class="eco-sec"><div class="eco-sec-head"><div class="eco-eyebrow dark">${esc(opts.eyebrow||'Inside Pegasus')}</div><h2>${esc(opts.title||'Where relationships move')}</h2></div>
      <div class="eco-grid">${cards.map((t,i)=>`<div class="eco-item"><div class="eco-item-k">${String(i+1).padStart(2,'0')}</div><div class="eco-item-t">${esc(t)}</div><div class="eco-item-d">${esc(paras[i]||paras[i%Math.max(1,paras.length)]||'')}</div></div>`).join('')}</div></section>`;
  }
  function marketing(key,opts={}){
    if(opts.layout==='ecosystem')
      return ecoHero(key,opts.hero||{eyebrow:opts.eyebrow}) + ecoBody(key,opts.body||{}) + cta(opts.cta||{});
    const useSteps=opts.layout==='steps';
    return hero(key,opts.hero||{eyebrow:opts.eyebrow})
      + (useSteps?steps(key,opts.body||{}):featGrid(key,opts.body||{}))
      + cta(opts.cta||{});
  }

  function mountContent(key,builder){
    P.mountPublic(opts_active(key));
    const main=document.createElement('main'); main.className='fade'; main.id='maincontent'; main.setAttribute('tabindex','-1');
    main.innerHTML = (typeof builder==='function'?builder():builder);
    document.body.appendChild(main);
    const f=document.createElement('div'); f.innerHTML=P.footer(); document.body.appendChild(f.firstElementChild);
    document.title=(C[key]&&C[key].title)||'Pegasus Network';
    if(document.getElementById('cinCanvas') && !window.__pegLiving){
      window.__pegLiving=true;
      var sc=document.createElement('script'); sc.src='/js/pegasus-living.js'; document.body.appendChild(sc);
    }
  }
  function opts_active(key){ const m={about:'Network','how-it-works':'Platform',contact:'Network'}; return m[key]||''; }

  // ---- directory ----
  function directory(key,opts){
    const items=opts.items||[];
    return hero(key,{eyebrow:opts.eyebrow||'Directory',h1:opts.h1,lead:opts.lead,ctas:opts.ctas||[['Join the Network','signup.html','btn-pri'],['View Pricing','membership.html','btn-ghost']]})
      +`<div class="section"><div class="dir-bar">
        <input class="input" style="flex:2;min-width:200px" placeholder="Search ${opts.noun||'members'}…">
        <select class="input" style="flex:1"><option>All Types</option>${(opts.filters||[]).map(x=>`<option>${x}</option>`).join('')}</select>
        <select class="input" style="flex:1"><option>All States</option><option>TX</option><option>FL</option><option>AZ</option><option>CA</option><option>NY</option></select>
        <button class="btn btn-pri">Search</button></div>
        <div style="font-size:11px;font-family:var(--mono);color:var(--text3);margin-bottom:14px">${items.length} verified ${opts.noun||'members'} · sorted by alignment</div>
        <div class="dir-grid">${items.map(m=>`<div class="card hc" style="cursor:pointer" onclick="location.href='${opts.profile||'/public-profile.html'}'"><div class="card-body">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><div class="avatar" style="width:42px;height:42px;border-radius:11px;background:${m.av};font-size:15px">${m.i}</div>
          <div><div style="font-size:13px;font-weight:600">${esc(m.n)}</div><div style="font-size:9px;font-family:var(--mono);color:${m.c};text-transform:uppercase;letter-spacing:0.06em">${esc(m.r)}</div></div>
          ${m.verified?'<span class="badge b-active" style="margin-left:auto">✓ Verified</span>':''}</div>
          <div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px">${esc(m.d)}</div>
          <div class="pill-row" style="margin-bottom:12px">${(m.tags||[]).map(t=>`<span class="tag" style="border:1px solid var(--border2);color:var(--text3)">${t}</span>`).join('')}</div>
          <div style="display:flex;gap:16px;border-top:1px solid var(--border);padding-top:11px">${(m.stats||[]).map(st=>`<div><div style="font-size:13px;font-family:var(--mono);font-weight:500">${st[0]}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">${st[1]}</div></div>`).join('')}</div>
        </div></div>`).join('')}</div></div>`+cta(opts.cta||{});
  }
  // ---- profile ----
  function profile(opts){
    const m=opts;
    return P.publicNav?'' :'';
  }
  function profileEmpty(id,mode){
    var own=mode==='own';
    var notfound=id&&mode!=='own';
    return `<div class="section" style="padding-top:40px">
      <div class="pcover"></div>
      <div class="pidentity" style="text-align:center;padding:48px 32px">
        <div style="width:72px;height:72px;border-radius:18px;background:var(--bg2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 20px">◉</div>
        ${notfound
          ? `<div style="font-family:var(--serif);font-weight:300;font-size:22px;margin-bottom:8px">Profile not available</div>
             <div style="font-size:13px;color:var(--text2);max-width:400px;margin:0 auto">This member's profile is private or the link is no longer active.</div>
             <a class="btn btn-ghost" href="/members.html" style="margin-top:24px">Browse the Network →</a>`
          : own
            ? `<div style="font-family:var(--serif);font-weight:300;font-size:22px;margin-bottom:8px">Build your institutional identity</div>
               <div style="font-size:13px;color:var(--text2);max-width:440px;margin:0 auto">Complete your Pegasus profile to gain visibility across the network, qualify for featured placement, and improve match quality.</div>
               <div style="display:flex;gap:12px;justify-content:center;margin-top:24px"><a class="btn btn-pri" href="/profile-edit.html">Complete Profile →</a><a class="btn btn-ghost" href="/membership.html">View Membership</a></div>`
            : `<div style="font-family:var(--serif);font-weight:300;font-size:22px;margin-bottom:8px">Discover the Network</div>
               <div style="font-size:13px;color:var(--text2);max-width:440px;margin:0 auto">Verified member profiles are accessible by network link. Join Pegasus to create your institutional identity and connect with capital partners.</div>
               <div style="display:flex;gap:12px;justify-content:center;margin-top:24px"><a class="btn btn-pri" href="/signup.html">Join the Network →</a><a class="btn btn-ghost" href="/signin.html">Sign In</a></div>`
        }
      </div>
    </div>`;
  }
  function profileBody(m){
    const cover = m.coverClass || (/(lender|capital|funding)/i.test(m.r||'')?'':(/(founder|developer)/i.test(m.r||'')?'warm':(/(rwa|partner)/i.test(m.r||'')?'teal':'')));
    // reputation chips
    const chips=[];
    if(m.verified) chips.push('<span class="rep-chip rep-verify">✓ Verified</span>');
    if(m.featured) chips.push('<span class="rep-chip rep-amb">★ '+esc(m.featured===true?'Ambassador':m.featured)+'</span>');
    if(m.institutional) chips.push('<span class="rep-chip rep-inst">⬢ Institutional</span>');
    if(m.speaker) chips.push('<span class="rep-chip rep-speaker">◗ Speaker</span>');
    if(/lender|capital/i.test(m.r||'')||m.capitalPartner) chips.push('<span class="rep-chip rep-cap">◆ Capital Partner</span>');
    if(/founder/i.test(m.r||'')||m.founder) chips.push('<span class="rep-chip rep-founder">▲ Founder</span>');
    if(m.topContributor) chips.push('<span class="rep-chip rep-top">⬆ Top Contributor</span>');
    (m.repBadges||[]).forEach(b=>chips.push('<span class="rep-chip rep-inst">'+esc(b)+'</span>'));
    const metrics=(m.metrics||[]);
    const sec=(title,inner)=>`<div class="ed-section"><div class="ed-h">${title}</div>${inner}</div>`;
    const kv=(rows)=>rows.map(d=>`<div class="kv"><span class="kv-k">${esc(d[0])}</span><span class="kv-v">${d[1]}</span></div>`).join('');
    const actColor={join:'var(--teal)',room:'var(--blue)',interest:'var(--green)',featured:'var(--gold)',brief:'var(--teal)',focus:'var(--blue)',launch:'var(--purple,#7048A8)'};
    const activity=(m.activityFeed|| (m.activity||[]).map(a=>['focus',a,'']) );
    return `<div class="section" style="padding-top:32px">
      <div class="pcover ${cover}">${m.coverEyebrow?`<div class="pc-eyebrow">${esc(m.coverEyebrow)}</div>`:''}</div>
      <div class="pidentity">
        <div class="pid-row">
          <div class="pav-xl" style="background:${m.av}">${m.i}</div>
          <div class="pid-main">
            <div class="pid-name">${esc(m.n)}</div>
            <div class="pid-title">${esc(m.title||m.r)}${m.company?` · <b style="color:var(--text2)">${esc(m.company)}</b>`:''}</div>
            <div class="pid-meta">${m.market?`<span>📍 ${esc(m.market)}</span>`:''}${m.since?`<span>Member since ${esc(m.since)}</span>`:''}${m.completion!=null?`<span>Profile ${m.completion}% complete</span>`:''}</div>
            <div class="rep-row">${chips.join('')}</div>
            ${m.currentFocus?`<div class="focus-chip"><span class="dot" style="background:var(--teal)"></span><b>Current focus:</b> ${esc(m.currentFocus)}</div>`:''}
          </div>
          <div class="pid-cta">
            <a class="btn btn-pri" href="/signin.html">${esc(m.cta||'Request Introduction')}</a>
            <a class="btn btn-ghost btn-sm" href="/signin.html" style="justify-content:center">${esc(m.cta2||'Save to Network')}</a>
            ${m.shareNote?`<span style="font-size:9px;color:var(--text3);font-family:var(--mono);text-align:center">${esc(m.shareNote)}</span>`:''}
          </div>
        </div>
      </div>
      ${metrics.length?`<div class="grid g${Math.min(metrics.length,6)}" style="margin-top:16px">${metrics.map(x=>`<div class="soft-stat" style="--accent:${x[2]||'var(--blue)'}"><div class="v">${x[0]}</div><div class="l">${x[1]}</div></div>`).join('')}</div>`:''}
      <div class="grid g2" style="margin-top:16px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px">
          ${m.bio?sec('About',`<div class="ed-prose">${esc(m.bio)}</div>`):''}
          ${m.details?sec(m.detailTitle||'Profile',kv(m.details)):''}
          ${m.appetite?sec(m.appetiteTitle||'Capital Appetite',kv(m.appetite)):''}
          ${m.capitalInterests?sec('Capital Interests',`<div class="pill-row">${m.capitalInterests.map(t=>`<span class="tag tag-b">${esc(t)}</span>`).join('')}</div>`):''}
          ${m.featuredWork?sec('Featured Work',`<div style="display:flex;flex-direction:column;gap:10px">${m.featuredWork.map(w=>`<div class="feat-work"><div class="fw-ic">${w[0]}</div><div><div style="font-size:12px;font-weight:600;color:var(--text)">${esc(w[1])}</div><div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:2px">${esc(w[2]||'')}</div></div></div>`).join('')}</div>`):''}
          ${m.markets?sec('Active Markets',`<div class="pill-row">${m.markets.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`):''}
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          ${m.alignment?`<div class="card dark"><div class="card-head"><div class="card-title"><span class="ai-avatar"><img src="/assets/brand/pegasus-symbol.svg" alt=""></span>${esc(m.alignmentTitle||'Strategic Alignment')}</div></div><div class="card-body"><div class="grid g3">${m.alignment.map(a=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center"><div style="font-size:18px;font-family:var(--mono);color:var(--teal)">${a[1]}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px">${esc(a[0])}</div></div>`).join('')}</div>${m.alignmentNote?`<p style="font-size:11px;color:var(--text2);line-height:1.6;margin-top:12px">${esc(m.alignmentNote)}</p>`:''}</div></div>`:''}
          ${m.credentials?sec('Credentials',m.credentials.map(c=>`<div style="display:flex;gap:9px;padding:7px 0;font-size:12px;color:var(--text2)"><span style="color:var(--green)">✓</span>${esc(c)}</div>`).join('')):''}
          ${m.sessions?sec('Speaking & Sessions',m.sessions.map(sn=>`<div style="padding:9px 0;border-bottom:1px solid var(--border)"><div style="font-size:12px;font-weight:600;color:var(--text)">${esc(sn[0])}</div><div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${esc(sn[1])}</div></div>`).join('')):''}
          ${m.dealRooms?sec('Active Deal Rooms',kv(m.dealRooms.map(d=>[d[0],`<span class="tag tag-t">${esc(d[1])}</span>`]))):''}
          ${m.intelligence?sec('Recent Intelligence',m.intelligence.map(i=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text2);line-height:1.5">${esc(i)}</div>`).join('')):''}
          ${m.media?sec('Media & Materials',`<div style="display:flex;gap:8px;flex-wrap:wrap">${m.media.map(md=>`<span class="media-chip">${md[0]} ${esc(md[1])}</span>`).join('')}</div>`):''}
          ${activity.length?sec('Network Activity',activity.map(a=>`<div class="pact-item"><span class="pact-dot" style="background:${actColor[a[0]]||'var(--blue)'}"></span><div><div class="pact-txt">${esc(a[1])}</div>${a[2]?`<div class="pact-time">${esc(a[2])}</div>`:''}</div></div>`).join('')):''}
        </div>
      </div>
      <div style="text-align:center;font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:22px;max-width:700px;margin-left:auto;margin-right:auto;line-height:1.6">
        ${esc(m.compliance||'Introductions are member-directed. Pegasus is a membership marketplace platform — not a lender, MLO, broker-dealer, real estate broker, or investment advisor. All capital decisions require independent professional and legal review.')}
      </div>
    </div>`;
  }
    // ---- public form (intake/contact) ----
  function form(opts){
    const fields=opts.fields||[];
    const slug=l=>'f_'+(l||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    const fid=fd=>fd[4]||slug(fd[0]);
    return hero(opts.key,{h1:opts.h1,lead:opts.lead,eyebrow:opts.eyebrow||'Get Started',ctas:[]})
      +`<div class="section"><div class="form-card card"><div class="card-body" style="padding:28px">
        ${opts.segments?`<div class="seg" id="f_segment">${opts.segments.map((s,i)=>`<div class="seg-opt ${i===0?'on':''}" data-v="${s[1]}" onclick="[...this.parentElement.children].forEach(c=>c.classList.remove('on'));this.classList.add('on')"><div class="seg-ic">${s[0]}</div><div class="seg-t">${s[1]}</div><div class="seg-d">${s[2]||''}</div></div>`).join('')}</div>`:''}
        ${fields.map(row=>`<div class="${row.length>1?'row'+row.length:'field'}">${row.map(fd=>`<div class="field"><label class="label" for="${fid(fd)}">${fd[0]}</label>${fd[2]==='select'?`<select class="input" id="${fid(fd)}">${fd[3].map(o=>`<option>${o}</option>`).join('')}</select>`:fd[2]==='area'?`<textarea class="input" id="${fid(fd)}" rows="4" placeholder="${fd[1]||''}"></textarea>`:`<input class="input ${fd[2]==='mono'?'input-mono':''}" id="${fid(fd)}" placeholder="${fd[1]||''}">`}</div>`).join('')}</div>`).join('')}
        <div id="f_err" style="color:var(--red);font-size:11px;font-family:var(--mono);min-height:14px;margin:4px 0"></div>
        <button class="btn btn-pri" id="f_submit" style="width:100%;justify-content:center;margin-top:4px" onclick="window.pegSubmit?window.pegSubmit(this):Pegasus.toast('✓','var(--green-dim)','${opts.toast||'Submitted'}','We\'ll be in touch')">${opts.submit||'Submit →'}</button>
        <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:14px;font-family:var(--mono)">Member-directed · Pegasus is not a lender or advisor</div>
      </div></div></div>`;
  }
  window.PegPages={directory,profileBody,profileEmpty,form,hero,featGrid,steps,cta,legal,faq,marketing,mountContent,esc};
})();
