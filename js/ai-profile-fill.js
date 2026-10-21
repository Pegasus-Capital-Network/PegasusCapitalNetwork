/* Pegasus — "Fill my profile with my AI"
   The member's own assistant (ChatGPT, Claude, Gemini) already knows who they
   are. We open it with a ready prompt, the member pastes the answer back, sees
   every field, edits anything, and confirms. Nothing is saved without that tap.

   PegAIFill.open({ mode:'save', onSaved(fields) })  → saves to profiles
   PegAIFill.open({ mode:'form', apply(fields) })    → hands fields to a form
*/
(function(){
  'use strict';
  if (window.PegAIFill) return;

  var PROMPT =
    "I'm setting up my professional profile on Pegasus Capital Network, a network where lenders, investors, real estate and AI professionals find each other. " +
    "Using what you know about me, fill in the profile below. Ask me only if you really don't know something. " +
    "Leave a field as \"\" if you're not sure, and never make up facts. " +
    "Reply with ONLY this JSON and nothing else:\n" +
    '{"full_name":"","professional_title":"","company_name":"","location":"City, State",' +
    '"headline":"one line about what I do, under 120 characters",' +
    '"bio":"3 to 5 sentences in first person, professional and specific, under 900 characters",' +
    '"current_focus":"what I am working on now, under 140 characters",' +
    '"specialties":["up to 6 short items"],"markets":["states or cities I work in"],' +
    '"website":"","linkedin_url":""}';

  var FIELDS = [
    ['full_name','Name',80],
    ['professional_title','Title',80],
    ['company_name','Company',80],
    ['location','Location',80],
    ['headline','Headline',120],
    ['current_focus','Working on now',140],
    ['bio','About',2000,'area'],
    ['specialties','Specialties',240,'list'],
    ['markets','Markets',200,'list'],
    ['website','Website',200],
    ['linkedin_url','LinkedIn',200]
  ];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  var CSS =
    '.paf-scrim{position:fixed;inset:0;background:rgba(9,18,30,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px;animation:pafIn .18s ease}' +
    '@keyframes pafIn{from{opacity:0}to{opacity:1}}' +
    '.paf{background:#fff;width:100%;max-width:520px;max-height:calc(100vh - 32px);overflow:auto;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.35);font-family:inherit;color:#0e1824}' +
    '.paf-h{background:linear-gradient(135deg,#0e1e36,#1b3a5b);color:#fff;padding:20px 22px 18px;position:relative}' +
    '.paf-h b{display:block;font-size:19px;letter-spacing:-.01em}.paf-h span{display:block;font-size:13px;color:rgba(255,255,255,.72);margin-top:4px}' +
    '.paf-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:18px;cursor:pointer}' +
    '.paf-b{padding:18px 22px 22px}' +
    '.paf-steps{display:flex;gap:6px;margin-bottom:14px}.paf-steps i{flex:1;height:3px;border-radius:3px;background:#e3e8ee}.paf-steps i.on{background:#9a7b3f}' +
    '.paf-ais{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
    '.paf-ai{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px;border:1px solid #e3e8ee;border-radius:12px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;color:#0e1824;text-decoration:none}' +
    '.paf-ai:hover{border-color:#1b3a5b;background:#f5f8fb}.paf-ai em{font-style:normal;font-size:22px;line-height:1}' +
    '.paf-note{font-size:12.5px;color:#5b6573;margin:12px 0 0;line-height:1.5}' +
    '.paf-link{background:none;border:0;padding:0;color:#1b3a5b;font-weight:600;text-decoration:underline;cursor:pointer;font-size:12.5px}' +
    '.paf-ta{width:100%;min-height:150px;border:1px solid #d7dde4;border-radius:12px;padding:12px;font:inherit;font-size:13.5px;resize:vertical}' +
    '.paf-row{margin-bottom:10px}.paf-row label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7685;margin-bottom:4px}' +
    '.paf-in{width:100%;border:1px solid #d7dde4;border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;color:#0e1824}.paf-in.area{min-height:110px;resize:vertical}' +
    '.paf-in.empty{background:#fafbfc}' +
    '.paf-act{display:flex;gap:8px;margin-top:16px;align-items:center}' +
    '.paf-btn{border:0;border-radius:10px;padding:12px 18px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;background:#1b3a5b;color:#fff;flex:1}' +
    '.paf-btn.gold{background:#9a7b3f}.paf-btn.ghost{background:#fff;color:#1b3a5b;border:1px solid #d7dde4;flex:0 0 auto}' +
    '.paf-btn[disabled]{opacity:.55;cursor:default}' +
    '.paf-err{color:#b42318;font-size:12.5px;margin-top:8px;min-height:1em}' +
    '.paf-go{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:0;border-radius:14px;padding:16px;font:inherit;font-size:16px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,#0e1e36,#1b3a5b 60%,#9a7b3f);box-shadow:0 8px 22px rgba(14,30,54,.25)}' +
    '.paf-go[disabled]{opacity:.7;cursor:default}' +
    '.paf-load{text-align:center;padding:26px 6px 10px}.paf-load b{display:block;font-size:16px;margin-top:14px}.paf-load span{display:block;font-size:13px;color:#5b6573;margin-top:6px;min-height:1.3em}' +
    '.paf-spin{width:44px;height:44px;margin:0 auto;border-radius:50%;border:3px solid #e3e8ee;border-top-color:#9a7b3f;animation:pafSpin 1s linear infinite}@keyframes pafSpin{to{transform:rotate(360deg)}}' +
    '.paf-alt{display:block;margin:16px auto 0;background:none;border:0;color:#5b6573;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer}' +
    '@media(max-width:640px){.paf-scrim{padding:0;align-items:flex-end}.paf{max-width:none;border-radius:18px 18px 0 0;max-height:92vh}}';

  function ensureCss(){
    if (document.getElementById('paf-css')) return;
    var st = document.createElement('style'); st.id = 'paf-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  function copy(text){
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function(){ return true; }, fallback); } catch(e){}
    return Promise.resolve(fallback());
    function fallback(){
      try { var t=document.createElement('textarea'); t.value=text; t.style.position='fixed'; t.style.opacity='0'; document.body.appendChild(t); t.select(); var ok=document.execCommand('copy'); t.remove(); return ok; } catch(e){ return false; }
    }
  }

  /* Pull the JSON object out of whatever the assistant replied (code fences,
     smart quotes, a sentence before it). */
  function parse(raw){
    var s = String(raw||'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    var body = s.slice(a, b+1);
    var obj = null;
    try { obj = JSON.parse(body); } catch(e){
      try { obj = JSON.parse(body.replace(/,\s*([}\]])/g,'$1')); } catch(e2){ return null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    var out = {}, any = false;
    FIELDS.forEach(function(f){
      var v = obj[f[0]];
      if (f[3] === 'list'){
        if (typeof v === 'string') v = v.split(/[,;]\s*/);
        v = Array.isArray(v) ? v.map(function(x){ return String(x||'').trim(); }).filter(Boolean).slice(0, 8) : [];
        if (v.length) any = true;
      } else {
        v = (v == null ? '' : String(v)).trim().slice(0, f[2]);
        if (v) any = true;
      }
      out[f[0]] = v;
    });
    return any ? out : null;
  }

  function open(opts){
    opts = opts || {};
    ensureCss();
    var old = document.getElementById('pafScrim'); if (old) old.remove();
    var scrim = document.createElement('div'); scrim.className = 'paf-scrim'; scrim.id = 'pafScrim';
    scrim.innerHTML = '<div class="paf" role="dialog" aria-modal="true" aria-label="Fill my profile with my AI">' +
      '<div class="paf-h"><b>✦ Let AI fill your profile</b><span>It finds you online and writes it. You check everything before it’s saved.</span>' +
      '<button class="paf-x" type="button" aria-label="Close">×</button></div><div class="paf-b" id="pafBody"></div></div>';
    document.body.appendChild(scrim);
    function close(){ scrim.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    scrim.querySelector('.paf-x').onclick = close;
    scrim.addEventListener('click', function(e){ if (e.target === scrim) close(); });
    var body = scrim.querySelector('#pafBody');
    var enc = encodeURIComponent(PROMPT);

    function steps(n){ return '<div class="paf-steps">' + [1,2,3].map(function(i){ return '<i' + (i<=n?' class="on"':'') + '></i>'; }).join('') + '</div>'; }

    async function draftNow(hint){
      body.innerHTML = '<div class="paf-load"><div class="paf-spin"></div><b>Writing your profile…</b><span id="pafMsg">Looking you up</span></div>';
      var msgs = ['Looking you up','Checking your company','Reading your website','Writing your headline','Writing your bio','Almost done'], mi = 0;
      var tick = setInterval(function(){ mi = Math.min(mi+1, msgs.length-1); var m = body.querySelector('#pafMsg'); if (m) m.textContent = msgs[mi]; }, 6000);
      var res = null;
      try {
        var sb = window.PegSB && (await window.PegSB.ready);
        var ses = sb && (await sb.auth.getSession());
        var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
        var C = window.PEG_CONFIG || {};
        if (!tok) throw new Error('auth');
        var ctl = window.AbortController ? new AbortController() : null;
        var to = setTimeout(function(){ try{ ctl && ctl.abort(); }catch(e){} }, 140000);
        var r = await fetch((C.SUPABASE_URL||'') + '/functions/v1/profile-ai-draft', {
          method: 'POST', signal: ctl ? ctl.signal : undefined,
          headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + tok, 'apikey': C.SUPABASE_ANON || '' },
          body: JSON.stringify({ hint: hint || '' })
        });
        clearTimeout(to);
        res = await r.json();
      } catch(e){ res = { ok:false, code:'error' }; }
      clearInterval(tick);
      if (!document.body.contains(scrim)) return;
      if (res && res.ok && res.draft){ step3(res.draft); return; }
      if (res && res.code === 'need_hint'){ step1('Tell us your name and company, or paste your LinkedIn or website, so the AI can find you.'); return; }
      if (res && res.code === 'no_key'){ own1('Our AI isn’t switched on yet. Use your own assistant for now, it takes a minute.'); return; }
      step1((res && res.message) || 'Couldn’t write it this time. Try again, or add your LinkedIn or website below.');
    }

    function step1(note){
      body.innerHTML =
        '<button class="paf-go" id="pafGo" type="button">✦ Write my profile</button>' +
        '<div class="paf-row" style="margin-top:14px"><label>Help it find you (optional)</label>' +
        '<input class="paf-in" id="pafHint" maxlength="600" placeholder="LinkedIn, website, or one line about you"></div>' +
        '<div class="paf-err" id="pafErr">' + esc(note||'') + '</div>' +
        '<button class="paf-alt" id="pafOwn" type="button">Prefer your own ChatGPT or Claude?</button>';
      body.querySelector('#pafGo').onclick = function(){ draftNow((body.querySelector('#pafHint').value||'').trim()); };
      body.querySelector('#pafOwn').onclick = function(){ own1(); };
      if (note) setTimeout(function(){ try{ body.querySelector('#pafHint').focus(); }catch(e){} }, 50);
    }

    function own1(note){
      body.innerHTML = steps(1) +
        (note ? '<div class="paf-err" style="margin:0 0 10px">' + esc(note) + '</div>' : '') +
        '<div style="font-size:15px;font-weight:700;margin-bottom:10px">1. Open your AI</div>' +
        '<div class="paf-ais">' +
          '<a class="paf-ai" data-ai href="https://chatgpt.com/?q=' + enc + '" target="_blank" rel="noopener"><em>◎</em>ChatGPT</a>' +
          '<a class="paf-ai" data-ai href="https://claude.ai/new?q=' + enc + '" target="_blank" rel="noopener"><em>✳</em>Claude</a>' +
          '<a class="paf-ai" data-ai href="https://gemini.google.com/app" target="_blank" rel="noopener"><em>✦</em>Gemini</a>' +
        '</div>' +
        '<p class="paf-note">The request is already copied. If it isn’t typed in for you, just paste it and send. Then copy the answer and come back here. <button class="paf-link" id="pafCopy" type="button">Copy the request again</button></p>' +
        '<div class="paf-act"><button class="paf-btn" id="pafNext" type="button">I have the answer →</button></div>';
      body.querySelectorAll('[data-ai]').forEach(function(a){ a.addEventListener('click', function(){ copy(PROMPT); setTimeout(step2, 400); }); });
      body.querySelector('#pafCopy').onclick = function(){ var b=this; copy(PROMPT); b.textContent='Copied ✓'; setTimeout(function(){ b.textContent='Copy the request again'; }, 1600); };
      body.querySelector('#pafNext').onclick = step2;
      copy(PROMPT);
    }

    function step2(){
      body.innerHTML = steps(2) +
        '<div style="font-size:15px;font-weight:700;margin-bottom:10px">2. Paste your AI’s answer</div>' +
        '<textarea class="paf-ta" id="pafTa" placeholder="Paste the whole answer here"></textarea>' +
        '<div class="paf-err" id="pafErr"></div>' +
        '<div class="paf-act"><button class="paf-btn ghost" id="pafBack" type="button">← Back</button><button class="paf-btn" id="pafRead" type="button">Show my profile →</button></div>';
      var ta = body.querySelector('#pafTa');
      body.querySelector('#pafBack').onclick = function(){ own1(); };
      function go(){
        var d = parse(ta.value);
        if (!d){ body.querySelector('#pafErr').textContent = 'That doesn’t look like the answer yet. Copy the whole reply from your AI, including the { } part.'; return; }
        step3(d);
      }
      body.querySelector('#pafRead').onclick = go;
      ta.addEventListener('paste', function(){ setTimeout(function(){ if (parse(ta.value)) go(); }, 60); });
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function(t){ if (t && parse(t) && !ta.value){ ta.value = t; } }, function(){});
        }
      } catch(e){}
      setTimeout(function(){ try{ ta.focus(); }catch(e){} }, 50);
    }

    function step3(d){
      var rows = FIELDS.map(function(f){
        var v = d[f[0]]; if (f[3] === 'list') v = (v||[]).join(', ');
        var cls = 'paf-in' + (f[3]==='area'?' area':'') + (v?'':' empty');
        var input = f[3]==='area'
          ? '<textarea class="'+cls+'" data-k="'+f[0]+'" maxlength="'+f[2]+'">'+esc(v)+'</textarea>'
          : '<input class="'+cls+'" data-k="'+f[0]+'" maxlength="'+f[2]+'" value="'+esc(v)+'">';
        return '<div class="paf-row"><label>'+esc(f[1])+'</label>'+input+'</div>';
      }).join('');
      body.innerHTML =
        '<div style="font-size:15px;font-weight:700;margin-bottom:4px">Check it and confirm</div>' +
        '<p class="paf-note" style="margin:0 0 12px">Change anything that isn’t right. Empty fields stay as they are.</p>' + rows +
        '<div class="paf-err" id="pafErr"></div>' +
        '<div class="paf-act"><button class="paf-btn ghost" id="pafBack" type="button">← Back</button><button class="paf-btn gold" id="pafSave" type="button">' + (opts.mode==='form'?'Use this in my profile':'Yes, save my profile') + '</button></div>';
      body.querySelector('#pafBack').onclick = function(){ step1(); };
      body.querySelector('#pafSave').onclick = async function(){
        var btn = this, err = body.querySelector('#pafErr');
        var out = {};
        body.querySelectorAll('[data-k]').forEach(function(el){
          var k = el.getAttribute('data-k'), v = (el.value||'').trim(), f = FIELDS.filter(function(x){ return x[0]===k; })[0];
          if (f[3] === 'list') v = v.split(/[,;]\s*/).map(function(x){ return x.trim(); }).filter(Boolean).slice(0, 8);
          if ((Array.isArray(v) && v.length) || (!Array.isArray(v) && v)) out[k] = v;
        });
        if (!Object.keys(out).length){ err.textContent = 'Nothing to save yet.'; return; }
        if (opts.mode === 'form'){ try { opts.apply && opts.apply(out); } catch(e){} close(); return; }
        btn.disabled = true; btn.textContent = 'Saving…'; err.textContent = '';
        try {
          var sb = window.PegSB && (await window.PegSB.ready);
          var ses = sb && (await sb.auth.getSession());
          var uid = ses && ses.data && ses.data.session && ses.data.session.user && ses.data.session.user.id;
          if (!uid) throw new Error('auth');
          var upd = Object.assign({}, out);
          if (upd.linkedin_url) upd.linkedin = upd.linkedin_url;
          var cur = await sb.from('profiles').select('profile_slug').eq('id', uid).maybeSingle();
          if (upd.full_name && !(cur && cur.data && cur.data.profile_slug)){
            var base = upd.full_name.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').slice(0, 40) || 'member';
            upd.profile_slug = base + '-' + uid.slice(0, 4);
          }
          var r = await sb.from('profiles').update(upd).eq('id', uid);
          if (r.error && upd.profile_slug){ delete upd.profile_slug; r = await sb.from('profiles').update(upd).eq('id', uid); }
          if (r.error) throw r.error;
          close();
          try { window.Pegasus && Pegasus.toast && Pegasus.toast('✓','var(--green-dim)','Profile saved','Your AI did the typing. You can edit it any time.'); } catch(e){}
          try { opts.onSaved && opts.onSaved(upd); } catch(e){}
        } catch(e){
          btn.disabled = false; btn.textContent = 'Yes, save my profile';
          err.textContent = 'Could not save right now. Please try again.';
        }
      };
    }

    step1();
  }

  window.PegAIFill = { open: open, prompt: PROMPT, parse: parse };
})();
