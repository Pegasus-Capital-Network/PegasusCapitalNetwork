/* ============================================================================
   PEGASUS — Member CRM (window.PegCRM)
   Private per-member CRM: contacts, deals pipeline (drag/drop), activity log,
   follow-up reminders, and one-click import of Pegasus members.
   Backend: Supabase (tables crm_contacts/crm_deals/crm_activities/crm_reminders,
   RPC crm_import_pegasus). Owner-scoped via RLS. Scoped UI to .crm-* .
   ========================================================================== */
(function(){
  'use strict';

  var STAGES = [
    ['lead','Lead'],['contacted','Contacted'],['qualified','Qualified'],
    ['proposal','Proposal'],['closed_won','Won'],['closed_lost','Lost']
  ];
  var STAGE_LABEL = {}; STAGES.forEach(function(s){ STAGE_LABEL[s[0]]=s[1]; });
  var KIND_LABEL = { note:'Note', email:'Email', call:'Call', meeting:'Meeting', stage_change:'Stage change' };

  var CRM = { contacts:[], deals:[], activities:[], reminders:[], tab:'pipeline', q:'', selected:new Set() };
  var DEMO_SEEDED = false;

  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  async function sb(){ try{ return await window.PegSB.ready; }catch(e){ return null; } }
  function live(){ var s=window.PegStore; return !!(s && s.get && s.get().mode==='live'); }
  var MY_UID=null;
  function uid(){ if(MY_UID) return MY_UID; var u=(window.PegProfile&&window.PegProfile.currentUser&&window.PegProfile.currentUser())||null; return u?u.id:'me'; }
  async function resolveUid(c){ try{ var r=await c.auth.getUser(); if(r&&r.data&&r.data.user){ MY_UID=r.data.user.id; } }catch(e){} return uid(); }
  function money(n){ if(n==null||n==='') return ''; var v=Number(n); if(isNaN(v)) return ''; return '$'+v.toLocaleString('en-US',{maximumFractionDigits:0}); }
  function el(id){ return document.getElementById(id); }
  function gv(id){ return (el(id)||{value:''}).value; }
  function fmtDate(d){ if(!d) return ''; var dt=new Date(d); if(isNaN(dt)) return ''; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function webUrl(u){ u=(u||'').trim(); if(!u) return null; if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u='https://'+u; return /^https?:\/\//i.test(u)?u.slice(0,400):null; }
  function isMissingCol(e){ var m=(e&&e.message||'').toLowerCase(); return m.indexOf('column')>=0 && (m.indexOf('does not exist')>=0||m.indexOf('schema cache')>=0); }
  function relDay(d){
    var dt=new Date(d); var today=new Date(); today.setHours(0,0,0,0);
    var t=new Date(dt); t.setHours(0,0,0,0); var diff=Math.round((t-today)/86400000);
    if(diff<0) return {cls:'overdue',label:Math.abs(diff)+'d overdue'};
    if(diff===0) return {cls:'today',label:'Today'};
    if(diff===1) return {cls:'soon',label:'Tomorrow'};
    return {cls:'',label:'in '+diff+'d'};
  }

  /* ── Data layer ─────────────────────────────────────────────────────────── */
  function seedDemo(){
    if(DEMO_SEEDED) return; DEMO_SEEDED=true;
    var c1={id:'c1',name:'Jane Mercer',company:'BlueRock Capital',contact_type:'lender',source:'pegasus_member',email:'',phone:'',tags:['Bridge'],notes:'',status:'active'};
    var c2={id:'c2',name:'Sam Ortiz',company:'Summit Brokerage',contact_type:'broker',source:'manual',email:'',phone:'',tags:[],notes:'',status:'active'};
    var c3={id:'c3',name:'Dana Whitfield',company:'Whitfield Holdings',contact_type:'borrower',source:'signup',email:'',phone:'',tags:['Multifamily'],notes:'',status:'active'};
    CRM.contacts=[c1,c2,c3];
    CRM.deals=[
      {id:'d1',title:'BlueRock bridge facility',amount:2500000,stage:'qualified',contact_id:'c1',expected_close:null,notes:''},
      {id:'d2',title:'Summit referral — retail pad',amount:850000,stage:'contacted',contact_id:'c2',expected_close:null,notes:''},
      {id:'d3',title:'Whitfield 48-unit acquisition',amount:6200000,stage:'proposal',contact_id:'c3',expected_close:null,notes:''},
      {id:'d4',title:'Inbound DSCR lead',amount:420000,stage:'lead',contact_id:null,expected_close:null,notes:''}
    ];
    CRM.reminders=[{id:'r1',title:'Send Jane the term sheet',due_at:new Date(Date.now()+2*864e5).toISOString(),done:false,contact_id:'c1',deal_id:'d1'}];
    CRM.activities=[{id:'a1',kind:'stage_change',body:'Lead → Qualified',deal_id:'d1',contact_id:null,created_at:new Date().toISOString()}];
  }

  async function loadAll(){
    if(!live()){ seedDemo(); return; }
    var c=await sb(); if(!c){ seedDemo(); return; }
    var u=await resolveUid(c);
    var res=await Promise.all([
      c.from('crm_contacts').select('*').eq('owner_id',u).order('created_at',{ascending:false}),
      c.from('crm_deals').select('*').eq('owner_id',u).order('sort',{ascending:true}).order('created_at',{ascending:false}),
      c.from('crm_reminders').select('*').eq('owner_id',u).order('due_at',{ascending:true}),
      c.from('crm_activities').select('*').eq('owner_id',u).order('created_at',{ascending:false}).limit(200)
    ]);
    CRM.contacts=(res[0].data)||[]; CRM.deals=(res[1].data)||[];
    CRM.reminders=(res[2].data)||[]; CRM.activities=(res[3].data)||[];
  }

  async function insertRow(table,row){
    if(!live()){ row.id=row.id||(table[4]+Date.now()); var arr=storeFor(table); arr.unshift(row); return row; }
    var c=await sb(); var r=await c.from(table).insert(row).select().single(); if(r.error) throw r.error; return r.data;
  }
  async function updateRow(table,id,patch){
    if(!live()){ var arr=storeFor(table); arr.forEach(function(x){ if(x.id===id) Object.assign(x,patch); }); return; }
    var c=await sb(); var r=await c.from(table).update(patch).eq('id',id); if(r.error) throw r.error;
  }
  async function deleteRow(table,id){
    if(!live()){ var arr=storeFor(table); var i=arr.findIndex(function(x){return x.id===id;}); if(i>=0)arr.splice(i,1); return; }
    var c=await sb(); var r=await c.from(table).delete().eq('id',id); if(r.error) throw r.error;
  }
  function storeFor(t){ return t==='crm_contacts'?CRM.contacts:t==='crm_deals'?CRM.deals:t==='crm_reminders'?CRM.reminders:CRM.activities; }
  function contactName(id){ var c=CRM.contacts.find(function(x){return x.id===id;}); return c?c.name:''; }

  /* ── Mount + shell ──────────────────────────────────────────────────────── */
  async function mount(){
    window.Pegasus.mountApp({ active:'', title:'CRM', sub:'Your private pipeline & relationships' });
    document.body.classList.add('crm-page');
    var v=el('pegView');
    v.innerHTML='<div class="crm-loading">Loading your workspace…</div>';
    try{ await loadAll(); }catch(e){ console.warn('[CRM] load failed:',e); }
    render();
  }

  function tabsHtml(){
    var rem=openReminders().length;
    var t=function(key,label,extra){ return '<button class="crm-tab '+(CRM.tab===key?'on':'')+'" onclick="PegCRM.go(\''+key+'\')">'+label+(extra?'<span class="crm-tab-n">'+extra+'</span>':'')+'</button>'; };
    return '<div class="crm-tabs">'+t('pipeline','Pipeline')+t('contacts','Contacts',CRM.contacts.length||'')+t('followups','Follow-ups',rem||'')+'</div>';
  }

  function render(){
    var v=el('pegView'); if(!v) return;
    var body = CRM.tab==='pipeline'?renderPipeline():CRM.tab==='contacts'?renderContacts():renderFollowups();
    v.innerHTML='<div class="crm-wrap">'+tabsHtml()+body+'</div>';
  }
  function go(tab){ CRM.tab=tab; render(); }

  /* ── Pipeline (kanban) ──────────────────────────────────────────────────── */
  function openDeals(){ return CRM.deals.filter(function(d){return d.stage!=='closed_won'&&d.stage!=='closed_lost';}); }
  function renderPipeline(){
    var open=openDeals();
    var openVal=open.reduce(function(s,d){return s+(Number(d.amount)||0);},0);
    var wonVal=CRM.deals.filter(function(d){return d.stage==='closed_won';}).reduce(function(s,d){return s+(Number(d.amount)||0);},0);
    var metrics='<div class="crm-metrics">'+
      metric('Open deals', open.length)+
      metric('Pipeline value', money(openVal)||'$0')+
      metric('Won', money(wonVal)||'$0')+
    '</div>';

    var cols=STAGES.map(function(s){
      var stage=s[0];
      var deals=CRM.deals.filter(function(d){return d.stage===stage;});
      var sum=deals.reduce(function(a,d){return a+(Number(d.amount)||0);},0);
      var cards=deals.map(dealCard).join('') || '<div class="crm-col-empty">—</div>';
      return '<div class="crm-col" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="PegCRM.drop(event,\''+stage+'\')">'+
        '<div class="crm-col-head"><span class="crm-col-name">'+s[1]+'</span><span class="crm-col-meta">'+deals.length+(sum?' · '+money(sum):'')+'</span></div>'+
        '<div class="crm-col-body">'+cards+'</div>'+
        '<button class="crm-col-add" onclick="PegCRM.dealModal(null,\''+stage+'\')">+ Add</button>'+
      '</div>';
    }).join('');

    return metrics+'<div class="crm-kanban">'+cols+'</div>';
  }
  function metric(label,val){ return '<div class="crm-metric"><div class="crm-metric-l">'+label+'</div><div class="crm-metric-v">'+esc(val)+'</div></div>'; }
  function dealCard(d){
    var cn=d.contact_id?contactName(d.contact_id):'';
    return '<div class="crm-card" draggable="true" ondragstart="PegCRM.dragStart(event,\''+d.id+'\')" onclick="PegCRM.dealModal(\''+d.id+'\')">'+
      '<div class="crm-card-title">'+esc(d.title)+'</div>'+
      (d.amount?'<div class="crm-card-amt">'+money(d.amount)+'</div>':'')+
      (cn?'<div class="crm-card-contact">'+esc(cn)+'</div>':'')+
      (d.expected_close?'<div class="crm-card-date">⏷ '+fmtDate(d.expected_close)+'</div>':'')+
    '</div>';
  }
  function dragStart(ev,id){ ev.dataTransfer.setData('text/plain',id); ev.dataTransfer.effectAllowed='move'; }
  async function drop(ev,stage){
    ev.preventDefault();
    var col=ev.currentTarget; if(col) col.classList.remove('drag');
    var id=ev.dataTransfer.getData('text/plain'); if(!id) return;
    var d=CRM.deals.find(function(x){return x.id===id;}); if(!d || d.stage===stage) return;
    var from=d.stage; d.stage=stage; render();
    try{
      await updateRow('crm_deals',id,{stage:stage});
      await logActivity({deal_id:id, kind:'stage_change', body:(STAGE_LABEL[from]||from)+' → '+(STAGE_LABEL[stage]||stage)});
    }catch(e){ console.error('[CRM] move failed:',e); d.stage=from; render(); window.Pegasus.toast('!','var(--red)','Move failed',e.message||''); }
  }

  /* ── Contacts ───────────────────────────────────────────────────────────── */
  function renderContacts(){
    var q=(CRM.q||'').toLowerCase();
    var rows=CRM.contacts.filter(function(c){ return !q || (c.name+' '+(c.company||'')+' '+(c.contact_type||'')).toLowerCase().indexOf(q)>=0; });
    var nSel=CRM.selected.size;
    var bulkBar=nSel>0
      ? '<div class="crm-bulk-bar">'+
          '<span class="crm-bulk-ct">'+nSel+' selected</span>'+
          '<button class="btn btn-ghost btn-sm" onclick="PegCRM.selectAll(false)">Clear</button>'+
          '<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(176,40,40,0.35)" onclick="PegCRM.deleteSelected()">🗑 Delete selected</button>'+
        '</div>'
      : '';
    var toolbar='<div class="crm-toolbar">'+
      '<input class="input crm-search" placeholder="Search contacts…" value="'+esc(CRM.q)+'" oninput="PegCRM.search(this.value)">'+
      '<div class="crm-toolbar-actions">'+
        '<button class="btn btn-ghost btn-sm" onclick="PegCRM.selectMembersModal()">⊕ Add from Network</button>'+
        '<button class="btn btn-pri btn-sm" onclick="PegCRM.contactModal()">+ Add contact</button>'+
      '</div></div>';
    if(!rows.length){
      return bulkBar+toolbar+'<div class="crm-empty"><div class="crm-empty-ic">◇</div><div class="crm-empty-t">No contacts yet</div>'+
        '<div class="crm-empty-s">Add a contact manually, or pick members from the Pegasus network.</div>'+
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
          '<button class="btn btn-ghost" onclick="PegCRM.selectMembersModal()">⊕ Add from Network</button>'+
          '<button class="btn btn-pri" onclick="PegCRM.contactModal()">+ Add contact</button>'+
        '</div></div>';
    }
    var allVis=rows.length>0&&rows.every(function(c){return CRM.selected.has(c.id);});
    var body=rows.map(function(c){
      var deals=CRM.deals.filter(function(d){return d.contact_id===c.id;}).length;
      var chk=CRM.selected.has(c.id);
      return '<tr class="'+(chk?'crm-row-sel':'')+'">'+
        '<td class="crm-cb-cell" onclick="event.stopPropagation();PegCRM.toggleSelect(\''+c.id+'\')">'+
          '<span class="crm-cb '+(chk?'on':'')+'">'+( chk?'✓':'' )+'</span>'+
        '</td>'+
        '<td onclick="PegCRM.contactDetail(\''+c.id+'\')" style="cursor:pointer">'+
          '<div class="crm-ct-name">'+esc(c.name)+'</div>'+(c.company?'<div class="crm-ct-sub">'+esc(c.company)+'</div>':'')+
        '</td>'+
        '<td>'+(c.contact_type?'<span class="crm-pill">'+esc(c.contact_type)+'</span>':'')+'</td>'+
        '<td><span class="crm-src crm-src-'+esc(c.source)+'">'+esc(srcLabel(c.source))+'</span></td>'+
        '<td class="crm-num">'+(deals||'')+'</td>'+
        '<td class="crm-ct-go" onclick="PegCRM.contactDetail(\''+c.id+'\')" style="cursor:pointer">›</td>'+
      '</tr>';
    }).join('');
    return bulkBar+toolbar+
      '<table class="crm-table"><thead><tr>'+
        '<th class="crm-cb-cell" onclick="PegCRM.selectAll('+(allVis?'false':'true')+')" style="cursor:pointer;width:32px">'+
          '<span class="crm-cb '+(allVis?'on':'')+'">'+( allVis?'✓':'')+'</span>'+
        '</th>'+
        '<th>Name</th><th>Type</th><th>Source</th><th class="crm-num">Deals</th><th></th>'+
      '</tr></thead><tbody>'+body+'</tbody></table>';
  }

  function srcLabel(s){ return {manual:'Manual',pegasus_member:'Pegasus',signup:'Signup',import:'Import'}[s]||s; }
  function search(v){ CRM.q=v; var t=el('crmTableHost'); render(); var i=document.querySelector('.crm-search'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } }

  /* ── Follow-ups ─────────────────────────────────────────────────────────── */
  function openReminders(){ return CRM.reminders.filter(function(r){return !r.done;}); }
  function renderFollowups(){
    var toolbar='<div class="crm-toolbar"><div class="crm-toolbar-title">Upcoming follow-ups</div>'+
      '<button class="btn btn-pri btn-sm" onclick="PegCRM.reminderModal()">+ Add reminder</button></div>';
    var rem=CRM.reminders.slice().sort(function(a,b){return new Date(a.due_at)-new Date(b.due_at);});
    if(!rem.length) return toolbar+'<div class="crm-empty"><div class="crm-empty-ic">◷</div><div class="crm-empty-t">No follow-ups scheduled</div><div class="crm-empty-s">Stay on top of relationships — schedule a reminder to follow up.</div><button class="btn btn-pri" onclick="PegCRM.reminderModal()">+ Schedule one</button></div>';
    var rows=rem.map(function(r){
      var rd=relDay(r.due_at); var cn=r.contact_id?contactName(r.contact_id):'';
      return '<div class="crm-rem '+(r.done?'done':'')+'">'+
        '<button class="crm-rem-check '+(r.done?'on':'')+'" onclick="PegCRM.toggleReminder(\''+r.id+'\')" aria-label="Toggle done">'+(r.done?'✓':'')+'</button>'+
        '<div class="crm-rem-body"><div class="crm-rem-title">'+esc(r.title)+'</div>'+
          (cn?'<div class="crm-rem-sub">'+esc(cn)+'</div>':'')+'</div>'+
        '<div class="crm-rem-due '+rd.cls+'">'+esc(rd.label)+'<span class="crm-rem-date">'+fmtDate(r.due_at)+'</span></div>'+
        '<button class="crm-rem-x" onclick="PegCRM.deleteReminder(\''+r.id+'\')" aria-label="Delete">✕</button>'+
      '</div>';
    }).join('');
    return toolbar+'<div class="crm-rem-list">'+rows+'</div>';
  }

  /* ── Modals ─────────────────────────────────────────────────────────────── */
  function contactOpts(selId){
    return '<option value="">— No contact —</option>'+CRM.contacts.map(function(c){
      return '<option value="'+c.id+'" '+(c.id===selId?'selected':'')+'>'+esc(c.name)+(c.company?' · '+esc(c.company):'')+'</option>';
    }).join('');
  }
  function shell(title, inner, footer){
    return '<div class="sce-scrim" onclick="if(event.target===this)Pegasus.closeModal()"><div class="sce-modal crm-modal">'+
      '<div class="sce-head"><div class="sce-title">'+esc(title)+'</div><button class="sce-x" onclick="Pegasus.closeModal()" aria-label="Close">✕</button></div>'+
      '<div class="crm-modal-body">'+inner+'</div>'+
      '<div class="sce-foot"><div id="crmErr" class="sce-err"></div>'+footer+'</div></div></div>';
  }

  function contactModal(id){
    var c=id?CRM.contacts.find(function(x){return x.id===id;}):null;
    var val=function(k){ return c&&c[k]!=null?esc(c[k]):''; };
    var inner='<div class="row2"><div class="field"><label class="label">Name</label><input class="input" id="ct_name" maxlength="80" value="'+val('name')+'" placeholder="Full name"></div>'+
      '<div class="field"><label class="label">Company</label><input class="input" id="ct_company" maxlength="80" value="'+val('company')+'" placeholder="Company"></div></div>'+
      '<div class="row2"><div class="field"><label class="label">Email</label><input class="input" id="ct_email" value="'+val('email')+'" placeholder="name@company.com"></div>'+
      '<div class="field"><label class="label">Phone</label><input class="input" id="ct_phone" value="'+val('phone')+'" placeholder="(555) 000-0000"></div></div>'+
      '<div class="row2"><div class="field"><label class="label">Type</label><input class="input" id="ct_type" list="ct_types" value="'+val('contact_type')+'" placeholder="lender, broker, borrower…">'+
        '<datalist id="ct_types"><option>lender</option><option>borrower</option><option>broker</option><option>agent</option><option>investor</option><option>partner</option></datalist></div>'+
      '<div class="field"><label class="label">Tags <span class="opt">(comma-separated)</span></label><input class="input" id="ct_tags" value="'+(c&&c.tags?esc(c.tags.join(", ")):'')+'" placeholder="Bridge, Multifamily"></div></div>'+
      '<div class="field"><label class="label">Notes</label><textarea class="ws-textarea" id="ct_notes" maxlength="600" data-count placeholder="Context, history, how you met…">'+val('notes')+'</textarea></div>'+
      /* Optional intelligence-workflow fields (migration 067). Collapsed by
         default so everyday CRM use stays light. Degrades gracefully: if 067
         is not applied, saveContact() silently drops unknown columns. */
      '<details style="margin-top:2px"'+((c&&(c.job_title||c.website||c.linkedin_url||c.address_line1||c.city||c.source_url||c.data_confidence))?' open':'')+'>'+
      '<summary style="cursor:pointer;font-size:11.5px;color:var(--text3);margin-bottom:10px">More details (title, address, links, data quality)</summary>'+
      '<div class="row2"><div class="field"><label class="label">Job title</label><input class="input" id="ct_job" maxlength="80" value="'+val('job_title')+'" placeholder="e.g. Senior VP, Investments"></div>'+
      '<div class="field"><label class="label">Website</label><input class="input" id="ct_web" maxlength="200" value="'+val('website')+'" placeholder="https://…"></div></div>'+
      '<div class="field"><label class="label">LinkedIn</label><input class="input" id="ct_li" maxlength="200" value="'+val('linkedin_url')+'" placeholder="linkedin.com/in/…"></div>'+
      '<div class="field"><label class="label">Address</label><input class="input" id="ct_addr" maxlength="160" value="'+val('address_line1')+'" placeholder="Street address"></div>'+
      '<div class="row2"><div class="field"><label class="label">City</label><input class="input" id="ct_city" maxlength="80" value="'+val('city')+'"></div>'+
      '<div class="field"><label class="label">State / ZIP</label><div style="display:flex;gap:8px"><input class="input" id="ct_state" maxlength="20" style="width:70px" value="'+val('state')+'" placeholder="FL"><input class="input" id="ct_zip" maxlength="12" value="'+val('postal_code')+'" placeholder="33480"></div></div></div>'+
      '<div class="row2"><div class="field"><label class="label">Data confidence</label><select class="input" id="ct_conf">'+
        ['','Verified','Reported','Estimated','Unknown'].map(function(o){return '<option value="'+o+'"'+((c&&c.data_confidence)===o||(!c&&o==='')?' selected':'')+'>'+(o||'—')+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label class="label">Source URL</label><input class="input" id="ct_src" maxlength="400" value="'+val('source_url')+'" placeholder="https://… (where this info came from)"></div></div>'+
      '</details>';
    var footer='<button class="btn btn-ghost" onclick="Pegasus.closeModal()">Cancel</button>'+
      (id?'<button class="btn btn-ghost crm-del" onclick="PegCRM.deleteContact(\''+id+'\')">Delete</button>':'')+
      '<button class="btn btn-pri" onclick="PegCRM.saveContact('+(id?'\''+id+'\'':'null')+')">'+(id?'Save':'Add contact')+'</button>';
    window.Pegasus.modal(shell((id?'Edit':'New')+' contact', inner, footer));
  }
  async function saveContact(id){
    var name=gv('ct_name').trim(); var err=el('crmErr');
    if(!name){ if(err)err.textContent='A name is required.'; return; }
    var row={ name:name, company:gv('ct_company').trim()||null, email:gv('ct_email').trim()||null, phone:gv('ct_phone').trim()||null,
      contact_type:gv('ct_type').trim()||null, notes:gv('ct_notes').trim()||null,
      tags:gv('ct_tags').split(',').map(function(t){return t.trim();}).filter(Boolean) };
    /* Optional intelligence fields (067). Only http(s) URLs are kept. */
    var extra={ job_title:gv('ct_job').trim()||null, website:webUrl(gv('ct_web')), linkedin_url:webUrl(gv('ct_li')),
      address_line1:gv('ct_addr').trim()||null, city:gv('ct_city').trim()||null, state:gv('ct_state').trim()||null,
      postal_code:gv('ct_zip').trim()||null, data_confidence:gv('ct_conf')||null, source_url:webUrl(gv('ct_src')) };
    try{
      if(id){ try{ await updateRow('crm_contacts',id,Object.assign({},row,extra)); Object.assign(CRM.contacts.find(function(x){return x.id===id;}),row,extra); }
        catch(e1){ if(!isMissingCol(e1)) throw e1; await updateRow('crm_contacts',id,row); Object.assign(CRM.contacts.find(function(x){return x.id===id;}),row); } }
      else { row.source='manual';
        try{ var saved=await insertRow('crm_contacts',Object.assign({},row,extra)); if(live())CRM.contacts.unshift(saved); }
        catch(e2){ if(!isMissingCol(e2)) throw e2; var saved2=await insertRow('crm_contacts',row); if(live())CRM.contacts.unshift(saved2); } }
      window.Pegasus.closeModal(); window.Pegasus.toast('◈','var(--blue-dim)',id?'Contact updated':'Contact added',name); render();
    }catch(e){ if(err)err.textContent=e.message||'Could not save.'; }
  }
  async function deleteContact(id){
    try{ await deleteRow('crm_contacts',id); var i=CRM.contacts.findIndex(function(x){return x.id===id;}); if(i>=0)CRM.contacts.splice(i,1);
      window.Pegasus.closeModal(); window.Pegasus.toast('✕','var(--red)','Contact removed',''); render();
    }catch(e){ var err=el('crmErr'); if(err)err.textContent=e.message||'Could not delete.'; }
  }

  function dealModal(id, stage){
    var d=id?CRM.deals.find(function(x){return x.id===id;}):null;
    var val=function(k){ return d&&d[k]!=null?esc(d[k]):''; };
    var stageSel=STAGES.map(function(s){ var on=(d?d.stage:stage||'lead')===s[0]; return '<option value="'+s[0]+'" '+(on?'selected':'')+'>'+s[1]+'</option>'; }).join('');
    var acts = d?CRM.activities.filter(function(a){return a.deal_id===id;}):[];
    var actHtml = d? '<div class="crm-detail-sec"><div class="crm-detail-h">Activity<button class="crm-mini" onclick="PegCRM.addNote(\'deal\',\''+id+'\')">+ Log note</button></div>'+
        (acts.length?acts.map(activityRow).join(''):'<div class="crm-detail-empty">No activity yet.</div>')+'</div>' : '';
    var inner='<div class="field"><label class="label">Deal title</label><input class="input" id="dl_title" value="'+val('title')+'" placeholder="e.g. BlueRock bridge facility"></div>'+
      '<div class="row2"><div class="field"><label class="label">Amount <span class="opt">(USD)</span></label><input class="input" id="dl_amount" type="number" value="'+(d&&d.amount!=null?d.amount:'')+'" placeholder="2500000"></div>'+
      '<div class="field"><label class="label">Stage</label><select class="input" id="dl_stage">'+stageSel+'</select></div></div>'+
      '<div class="row2"><div class="field"><label class="label">Contact</label><select class="input" id="dl_contact">'+contactOpts(d?d.contact_id:null)+'</select></div>'+
      '<div class="field"><label class="label">Expected close</label><input class="input" id="dl_close" type="date" value="'+(d&&d.expected_close?String(d.expected_close).slice(0,10):'')+'"></div></div>'+
      '<div class="field"><label class="label">Notes</label><textarea class="ws-textarea" id="dl_notes" placeholder="Deal context…">'+val('notes')+'</textarea></div>'+actHtml;
    var footer='<button class="btn btn-ghost" onclick="Pegasus.closeModal()">Cancel</button>'+
      (id?'<button class="btn btn-ghost crm-del" onclick="PegCRM.deleteDeal(\''+id+'\')">Delete</button>':'')+
      '<button class="btn btn-pri" onclick="PegCRM.saveDeal('+(id?'\''+id+'\'':'null')+')">'+(id?'Save':'Add deal')+'</button>';
    window.Pegasus.modal(shell((id?'Edit':'New')+' deal', inner, footer));
  }
  async function saveDeal(id){
    var title=gv('dl_title').trim(); var err=el('crmErr');
    if(!title){ if(err)err.textContent='Give the deal a title.'; return; }
    var amt=gv('dl_amount').trim();
    var row={ title:title, amount:amt===''?null:Number(amt), stage:gv('dl_stage'),
      contact_id:gv('dl_contact')||null, expected_close:gv('dl_close')||null, notes:gv('dl_notes').trim()||null };
    try{
      if(id){ var prev=CRM.deals.find(function(x){return x.id===id;}); var fromStage=prev.stage; await updateRow('crm_deals',id,row); Object.assign(prev,row);
        if(fromStage!==row.stage) await logActivity({deal_id:id,kind:'stage_change',body:(STAGE_LABEL[fromStage]||fromStage)+' → '+(STAGE_LABEL[row.stage]||row.stage)}); }
      else { var saved=await insertRow('crm_deals',row); if(live())CRM.deals.unshift(saved); }
      window.Pegasus.closeModal(); window.Pegasus.toast('◈','var(--blue-dim)',id?'Deal updated':'Deal added',title); render();
    }catch(e){ if(err)err.textContent=e.message||'Could not save.'; }
  }
  async function deleteDeal(id){
    try{ await deleteRow('crm_deals',id); var i=CRM.deals.findIndex(function(x){return x.id===id;}); if(i>=0)CRM.deals.splice(i,1);
      window.Pegasus.closeModal(); window.Pegasus.toast('✕','var(--red)','Deal removed',''); render();
    }catch(e){ var err=el('crmErr'); if(err)err.textContent=e.message||'Could not delete.'; }
  }

  function reminderModal(opts){
    opts=opts||{};
    var inner='<div class="field"><label class="label">Reminder</label><input class="input" id="rm_title" placeholder="e.g. Call about term sheet"></div>'+
      '<div class="row2"><div class="field"><label class="label">Due</label><input class="input" id="rm_due" type="date" value="'+(new Date(Date.now()+864e5).toISOString().slice(0,10))+'"></div>'+
      '<div class="field"><label class="label">Contact</label><select class="input" id="rm_contact">'+contactOpts(opts.contact_id)+'</select></div></div>';
    var footer='<button class="btn btn-ghost" onclick="Pegasus.closeModal()">Cancel</button>'+
      '<button class="btn btn-pri" onclick="PegCRM.saveReminder('+(opts.deal_id?'\''+opts.deal_id+'\'':'null')+')">Schedule</button>';
    window.Pegasus.modal(shell('New follow-up', inner, footer));
  }
  async function saveReminder(dealId){
    var title=gv('rm_title').trim(); var err=el('crmErr');
    if(!title){ if(err)err.textContent='Describe the follow-up.'; return; }
    var due=gv('rm_due'); if(!due){ if(err)err.textContent='Pick a due date.'; return; }
    var row={ title:title, due_at:new Date(due+'T09:00:00').toISOString(), contact_id:gv('rm_contact')||null, deal_id:dealId||null, done:false };
    try{ var saved=await insertRow('crm_reminders',row); if(live())CRM.reminders.push(saved);
      window.Pegasus.closeModal(); window.Pegasus.toast('◷','var(--blue-dim)','Follow-up scheduled',title); render();
    }catch(e){ if(err)err.textContent=e.message||'Could not save.'; }
  }
  async function toggleReminder(id){
    var r=CRM.reminders.find(function(x){return x.id===id;}); if(!r) return; r.done=!r.done; render();
    try{ await updateRow('crm_reminders',id,{done:r.done}); }catch(e){ r.done=!r.done; render(); }
  }
  async function deleteReminder(id){
    var i=CRM.reminders.findIndex(function(x){return x.id===id;}); if(i<0) return; var bak=CRM.reminders[i]; CRM.reminders.splice(i,1); render();
    try{ await deleteRow('crm_reminders',id); }catch(e){ CRM.reminders.splice(i,0,bak); render(); }
  }

  /* ── Contact detail ─────────────────────────────────────────────────────── */
  function activityRow(a){
    return '<div class="crm-act"><span class="crm-act-kind crm-act-'+esc(a.kind)+'">'+esc(KIND_LABEL[a.kind]||a.kind)+'</span>'+
      '<span class="crm-act-body">'+esc(a.body||'')+'</span><span class="crm-act-when">'+fmtDate(a.created_at)+'</span></div>';
  }
  function contactDetail(id){
    var c=CRM.contacts.find(function(x){return x.id===id;}); if(!c) return;
    var deals=CRM.deals.filter(function(d){return d.contact_id===id;});
    var acts=CRM.activities.filter(function(a){return a.contact_id===id;});
    var dealsHtml=deals.length?deals.map(function(d){ return '<div class="crm-detail-row" onclick="Pegasus.closeModal();PegCRM.dealModal(\''+d.id+'\')"><span>'+esc(d.title)+'</span><span class="crm-pill">'+esc(STAGE_LABEL[d.stage]||d.stage)+'</span><span class="crm-detail-amt">'+money(d.amount)+'</span></div>'; }).join(''):'<div class="crm-detail-empty">No deals yet.</div>';
    var actsHtml=acts.length?acts.map(activityRow).join(''):'<div class="crm-detail-empty">No activity yet.</div>';
    var place=[c.address_line1,c.city,c.state,c.postal_code].filter(Boolean).join(', ');
    var links=(c.website?'<a href="'+esc(webUrl(c.website)||'#')+'" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">Website</a>':'')+
      (c.linkedin_url?(c.website?' · ':'')+'<a href="'+esc(webUrl(c.linkedin_url)||'#')+'" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">LinkedIn</a>':'');
    var quality=(c.data_confidence?'<span class="crm-pill" title="Data confidence">'+esc(c.data_confidence)+'</span>':'')+
      (c.last_verified_at?'<span style="font-size:10.5px;color:var(--text3)">checked '+fmtDate(c.last_verified_at)+'</span>':'')+
      (c.source_url?'<a href="'+esc(webUrl(c.source_url)||'#')+'" target="_blank" rel="noopener noreferrer" style="font-size:10.5px;color:var(--blue)">source ↗</a>':'');
    var inner='<div class="crm-detail-id">'+
        '<div class="crm-detail-name">'+esc(c.name)+'</div>'+
        ((c.job_title||c.company)?'<div class="crm-detail-co">'+esc([c.job_title,c.company].filter(Boolean).join(' · '))+'</div>':'')+
        '<div class="crm-detail-chips">'+(c.contact_type?'<span class="crm-pill">'+esc(c.contact_type)+'</span>':'')+'<span class="crm-src crm-src-'+esc(c.source)+'">'+esc(srcLabel(c.source))+'</span>'+(c.tags||[]).map(function(t){return '<span class="crm-tagchip">'+esc(t)+'</span>';}).join('')+'</div>'+
        ((c.email||c.phone)?'<div class="crm-detail-contact">'+(c.email?'<span>✉ '+esc(c.email)+'</span>':'')+(c.phone?'<span>☎ '+esc(c.phone)+'</span>':'')+'</div>':'')+
        (place?'<div class="crm-detail-contact"><span>⌂ '+esc(place)+'</span></div>':'')+
        (links?'<div class="crm-detail-contact" style="gap:6px">'+links+'</div>':'')+
        (quality?'<div class="crm-detail-chips" style="align-items:center;gap:8px">'+quality+'</div>':'')+
        (c.notes?'<div class="crm-detail-notes">'+esc(c.notes)+'</div>':'')+
      '</div>'+
      '<div class="crm-detail-sec"><div class="crm-detail-h">Deals</div>'+dealsHtml+'</div>'+
      '<div class="crm-detail-sec"><div class="crm-detail-h">Activity<button class="crm-mini" onclick="PegCRM.addNote(\'contact\',\''+id+'\')">+ Log note</button></div>'+actsHtml+'</div>';
    var footer='<button class="btn btn-ghost" onclick="Pegasus.closeModal();PegCRM.reminderModal({contact_id:\''+id+'\'})">+ Reminder</button>'+
      '<button class="btn btn-ghost" onclick="Pegasus.closeModal();PegCRM.dealModal(null,\'lead\')">+ Deal</button>'+
      '<button class="btn btn-pri" onclick="Pegasus.closeModal();PegCRM.contactModal(\''+id+'\')">Edit contact</button>';
    window.Pegasus.modal(shell('Contact', inner, footer));
  }

  async function logActivity(a){
    var row=Object.assign({ kind:'note', body:'' }, a);
    try{ var saved=await insertRow('crm_activities',row); if(live())CRM.activities.unshift(saved); else CRM.activities.unshift(row); }catch(e){ console.warn('[CRM] activity log failed',e); }
  }
  function addNote(scope,id){
    var inner='<div class="row2"><div class="field"><label class="label">Type</label><select class="input" id="nt_kind"><option value="note">Note</option><option value="email">Email</option><option value="call">Call</option><option value="meeting">Meeting</option></select></div><div></div></div>'+
      '<div class="field"><label class="label">Detail</label><textarea class="ws-textarea" id="nt_body" placeholder="What happened / what to remember…"></textarea></div>';
    var footer='<button class="btn btn-ghost" onclick="Pegasus.closeModal()">Cancel</button>'+
      '<button class="btn btn-pri" onclick="PegCRM.saveNote(\''+scope+'\',\''+id+'\')">Log</button>';
    window.Pegasus.modal(shell('Log activity', inner, footer));
  }
  async function saveNote(scope,id){
    var body=gv('nt_body').trim(); var err=el('crmErr'); if(!body){ if(err)err.textContent='Add a detail.'; return; }
    var a={ kind:gv('nt_kind'), body:body }; if(scope==='contact')a.contact_id=id; else a.deal_id=id;
    await logActivity(a); window.Pegasus.closeModal(); window.Pegasus.toast('◈','var(--blue-dim)','Logged',''); 
    if(scope==='contact') contactDetail(id); else render();
  }

  /* ── Import ─────────────────────────────────────────────────────────────── */
  async function importPegasus(){
    if(!live()){ window.Pegasus.toast('◈','var(--blue-dim)','Demo mode','Sign in to import live members.'); return; }
    var c=await sb(); if(!c) return;
    window.Pegasus.toast('◷','var(--blue-dim)','Importing…','Pulling Pegasus members');
    try{
      var r=await c.rpc('crm_import_pegasus'); if(r.error) throw r.error;
      await loadAll(); render();
      var n=r.data||0;
      window.Pegasus.toast('◈','var(--blue-dim)', n?('Imported '+n+' member'+(n===1?'':'s')):'You\u2019re all caught up', n?'Added to your contacts':'No new members to import');
    }catch(e){ console.error('[CRM] import failed',e); window.Pegasus.toast('!','var(--red)','Import failed', e.message||''); }
  }


  /* === Checkbox selection ================================================== */
  function toggleSelect(id){
    if(CRM.selected.has(id)) CRM.selected.delete(id); else CRM.selected.add(id);
    render();
  }
  function selectAll(on){
    if(on){ CRM.contacts.forEach(function(c){ CRM.selected.add(c.id); }); }
    else { CRM.selected.clear(); }
    render();
  }
  async function deleteSelected(){
    var ids=Array.from(CRM.selected); if(!ids.length) return;
    if(!window.confirm('Delete '+ids.length+' contact'+(ids.length>1?'s':'')+' and their associated data?')) return;
    window.Pegasus.toast('◔','var(--blue-dim)','Deleting…','Removing '+ids.length+' contact'+(ids.length>1?'s':''));
    try{
      for(var i=0;i<ids.length;i++){ await deleteRow('crm_contacts',ids[i]); }
      CRM.selected.clear(); await loadAll(); render();
      window.Pegasus.toast('◈','var(--blue-dim)','Deleted','Contacts removed');
    }catch(e){ window.Pegasus.toast('!','var(--red)','Delete failed',e&&e.message||''); }
  }

  /* === Selective member picker ============================================= */
  async function selectMembersModal(){
    if(!live()){ window.Pegasus.toast('◈','var(--blue-dim)','Demo mode','Sign in to add from network.'); return; }
    var c=await sb(); if(!c) return;
    window.Pegasus.modal(pickerShell('Add from Pegasus Network',
      '<div style="text-align:center;padding:40px;color:var(--text2);font-size:13px">Loading members…</div>',
      '<button class="btn btn-ghost" onclick="Pegasus.closeModal()">Cancel</button>'+
      '<button class="btn btn-pri" id="crm-picker-add" disabled>Add Selected</button>'));
    try{
      /* Public/member-discovery fields ONLY — never pull another member's
         private email into the browser or the caller's CRM (they can fill
         contact details in themselves). */
      var pr=await c.from('member_directory').select('id,full_name,role,company_name,profile_completion')
        .not('full_name','is',null).order('profile_completion',{ascending:false}).limit(100);
      var profiles=pr.data||[];
      var existing=new Set();
      CRM.contacts.forEach(function(ct){ if(ct.linked_profile_id) existing.add(ct.linked_profile_id); });
      var ps={selected:new Set(),q:''};

      function rp(){
        var q=ps.q.toLowerCase();
        var rows=q?profiles.filter(function(p){return (p.full_name||'').toLowerCase().indexOf(q)>=0||(p.company_name||'').toLowerCase().indexOf(q)>=0;}):profiles;
        var body='<div style="padding:12px 16px 4px;border-bottom:1px solid var(--border)">'+
          '<input id="crm-picker-q" class="input" placeholder="Search…" value="'+esc(ps.q)+'" oninput="PegCRM._ps(this.value)" autocomplete="off" style="width:100%;box-sizing:border-box">'+
          '</div><div style="overflow-y:auto;max-height:320px;padding:8px 0">'+
          (rows.length?rows.map(function(p){
            var alr=existing.has(p.id);
            var chk=ps.selected.has(p.id);
            var ini=(p.full_name||'?').split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase();
            var tl=(p.role||'member').replace(/_/g,' ').replace(/w/g,function(x){return x.toUpperCase();});
            return '<div class="crm-picker-row'+(alr?' crm-picker-already':'')+(chk?' crm-picker-checked':'')+'" '+
              (alr?'':'onclick="PegCRM._pt(\''+p.id+'\')"')+
              ' style="display:flex;align-items:center;gap:12px;padding:8px 16px;cursor:'+(alr?'default':'pointer')+'">'+
              '<span class="crm-cb '+(chk?'on':'')+'">'+( chk?'✓':'' )+'</span>'+
              '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#112244,#2271c3);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:600">'+ini+'</div>'+
              '<div style="flex:1;min-width:0">'+
                '<div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.full_name||'—')+(alr?' <span style="font-size:10px;color:var(--text3)">✓ in CRM</span>':'')+'</div>'+
                '<div style="font-size:11px;color:var(--text3)">'+esc(tl)+(p.company_name?' · '+esc(p.company_name):'')+'</div>'+
              '</div></div>';
          }).join(''):'<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">No members found</div>')+
          '</div><div style="padding:10px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)">'+
            ps.selected.size+' selected · '+profiles.length+' Pegasus members</div>';
        var h=document.getElementById('crm-picker-body'); if(h) h.innerHTML=body;
        var ab=document.getElementById('crm-picker-add');
        if(ab){ ab.disabled=ps.selected.size===0; if(!ab._w){ab._w=1;ab.onclick=function(){doAdd(c,profiles,ps);};} }
      }
      window.PegCRM._pt=function(id){ if(ps.selected.has(id)) ps.selected.delete(id); else ps.selected.add(id); rp(); };
      window.PegCRM._ps=function(q){ ps.q=q; rp(); setTimeout(function(){var i=document.getElementById('crm-picker-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},0); };
      rp();
    }catch(e){
      var h=document.getElementById('crm-picker-body');
      if(h) h.innerHTML='<div style="padding:24px;color:var(--red);font-size:12px">Failed: '+esc(e&&e.message||'unknown')+'</div>';
    }
  }
  function pickerShell(title,inner,footer){
    return '<div class="sce-scrim" onclick="if(event.target===this)Pegasus.closeModal()">'+
      '<div class="sce-modal crm-modal" style="max-width:520px;width:92vw">'+
        '<div class="crm-modal-head"><div class="crm-modal-title">'+esc(title)+'</div>'+
          '<button class="crm-modal-x" onclick="Pegasus.closeModal()" aria-label="Close">×</button></div>'+
        '<div id="crm-picker-body" class="crm-modal-body" style="padding:0">'+inner+'</div>'+
        '<div class="crm-modal-foot">'+footer+'</div>'+
      '</div></div>';
  }
  async function doAdd(c,profiles,ps){
    var ids=Array.from(ps.selected); if(!ids.length) return;
    var toAdd=profiles.filter(function(p){return ids.indexOf(p.id)>=0;});
    var ab=document.getElementById('crm-picker-add'); if(ab){ab.disabled=true;ab.textContent='Adding…';}
    var u=uid(); var n=0;
    try{
      for(var i=0;i<toAdd.length;i++){
        var p=toAdd[i];
        await insertRow('crm_contacts',{owner_id:u,name:p.full_name||'Pegasus Member',
          company:p.company_name||null,contact_type:(p.role||'member').replace(/_/g,' '),
          source:'pegasus_member',linked_profile_id:p.id,status:'active',tags:[],notes:''}); n++;
      }
      window.Pegasus.closeModal(); await loadAll(); render();
      window.Pegasus.toast('◈','var(--blue-dim)','Added '+n+' contact'+(n===1?'':'s'),
        n===1?toAdd[0].full_name+' added to CRM':'Added to your CRM');
    }catch(e){
      if(ab){ab.disabled=false;ab.textContent='Add Selected';}
      window.Pegasus.toast('!','var(--red)','Add failed',e&&e.message||'');
    }
  }

    window.PegCRM = {

    mount:mount, go:go, search:search,
    dragStart:dragStart, drop:drop,
    contactModal:contactModal, saveContact:saveContact, deleteContact:deleteContact, contactDetail:contactDetail,
    dealModal:dealModal, saveDeal:saveDeal, deleteDeal:deleteDeal,
    reminderModal:reminderModal, saveReminder:saveReminder, toggleReminder:toggleReminder, deleteReminder:deleteReminder,
    addNote:addNote, saveNote:saveNote, importPegasus:importPegasus,
    toggleSelect:toggleSelect, selectAll:selectAll, deleteSelected:deleteSelected,
    selectMembersModal:selectMembersModal, _pt:null, _ps:null
  };
})();
