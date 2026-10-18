/* Investor Acquisition CRM, admin-only, existing pn_capital_pipeline table. No send, publish or automatic outreach. */
(function(){
'use strict';
const F=['candidate','base_location','classification','priority','relevance','evidence','source1','source2','contact_path','min_cheque','caveat','draft_subject','draft_body','draft_destination','draft_notes','status','owner','next_action','next_action_date','notes','source','verified_date'];
const LONG=new Set(['relevance','evidence','caveat','draft_body','draft_notes','next_action','notes']);
const REQUIRED=new Set(['candidate','classification','source1']);
let db,root,records=[],filter='',category='all';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=v=>{try{const u=new URL(String(v));return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const el=(tag,attrs={},text='')=>{const x=document.createElement(tag);for(const [k,v] of Object.entries(attrs))x.setAttribute(k,v);x.textContent=text;return x;};
const label=k=>k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const allowed=['research','qualify','draft','approved','contacted','replied','meeting','dormant','do_not_contact'];
async function admin(){let u=await db.auth.getUser();let id=u.data&&u.data.user&&u.data.user.id;if(!id)return false;let p=await db.from('profiles').select('is_admin').eq('id',id).maybeSingle();return !p.error&&p.data&&p.data.is_admin===true;}
async function load(){let r=await db.from('pn_capital_pipeline').select('id,'+F.join(',')).order('created_at',{ascending:false}).limit(1000);if(r.error)throw r.error;records=r.data||[];render();}
function render(){
const list=records.filter(r=>(category==='all'||(r.status||'research')===category)&&(!filter||[r.candidate,r.base_location,r.classification,r.contact_path,r.status].some(v=>String(v||'').toLowerCase().includes(filter))));
root.innerHTML='<div id="investor-crm"><p class="muted">Admin only · Existing Supabase RLS · Drafts are never sent from this page · No return or liquidity claims</p><div class="controls"><input id="ic-search" aria-label="Search investors" placeholder="Search investors" value="'+esc(filter)+'"><select id="ic-filter" aria-label="Pipeline status">'+['all',...allowed].map(s=>'<option value="'+s+'" '+(category===s?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select><button class="btn btn-pri" id="ic-new">Add researched investor</button><button class="btn btn-ghost" id="ic-refresh">Refresh</button></div><p>'+list.length+' visible / '+records.length+' records (maximum 1,000 loaded)</p><div class="scroll"><table><thead><tr><th>Investor</th><th>Type / region</th><th>Evidence</th><th>Contact</th><th>Cheque</th><th>Status</th><th>Next action</th></tr></thead><tbody>'+list.map(r=>'<tr><td><button class="btn btn-ghost btn-sm" data-edit="'+esc(r.id)+'">'+esc(r.candidate)+'</button></td><td>'+esc(r.classification)+'<br><span class="muted">'+esc(r.base_location)+'</span></td><td>'+(url(r.source1)?'<a href="'+esc(url(r.source1))+'" target="_blank" rel="noopener noreferrer">Source ↗</a>':'Not verified')+'</td><td>'+esc(r.contact_path)+'</td><td>'+esc(r.min_cheque||'Unknown')+'</td><td>'+esc(r.status||'research')+'</td><td>'+esc(r.next_action)+'</td></tr>').join('')+'</tbody></table></div><div id="ic-dialog"></div><p id="ic-message" role="status"></p></div>';
root.querySelector('#ic-search').addEventListener('input',e=>{filter=e.target.value;render();root.querySelector('#ic-search').focus();});
root.querySelector('#ic-filter').addEventListener('change',e=>{category=e.target.value;render();});
root.querySelector('#ic-new').addEventListener('click',()=>edit(null));
root.querySelector('#ic-refresh').addEventListener('click',()=>load().catch(showError));
root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>edit(records.find(r=>r.id===b.dataset.edit))));
}
function showError(e){const p=root.querySelector('#ic-message');if(p)p.textContent='Error: '+(e.message||String(e));}
function edit(record){
const host=root.querySelector('#ic-dialog');host.replaceChildren();const overlay=el('div',{class:'modal'}),panel=el('section',{class:'panel','aria-label':'Investor editor'});
panel.append(el('h3',{},record?'Edit investor':'Add researched investor'),el('p',{class:'muted'},'Evidence-backed records only. No mail is transmitted.'));
const form=el('form',{class:'editor'});const inputRefs={};
for(const key of F){const l=el('label',{class:LONG.has(key)?'wide':''},label(key)+(REQUIRED.has(key)?' *':''));let input;
if(key==='status'){input=el('select',{name:key});for(const st of allowed)input.append(el('option',{value:st},st));}
else if(LONG.has(key))input=el('textarea',{name:key});
else input=el('input',{name:key,type:key.endsWith('_date')?'date':'text'});
input.value=record&&record[key]!=null?String(record[key]):(key==='status'?'research':'');l.append(input);form.append(l);inputRefs[key]=input;}
const actions=el('div',{class:'wide'}),save=el('button',{class:'btn btn-pri',type:'submit'},'Save record'),cancel=el('button',{class:'btn btn-ghost',type:'button'},'Cancel'),msg=el('p',{role:'status'});
actions.append(save,cancel,msg);form.append(actions);panel.append(form);overlay.append(panel);host.append(overlay);
cancel.addEventListener('click',()=>host.replaceChildren());
form.addEventListener('submit',async e=>{e.preventDefault();let row={};for(const k of F)row[k]=inputRefs[k].value.trim()||null;
if(!row.candidate||!row.classification||!url(row.source1)){msg.textContent='Candidate, classification and a valid source1 HTTPS/HTTP URL are required.';return;}
for(const k of ['source2','draft_destination'])if(row[k]&&k==='source2'&&!url(row[k])){msg.textContent='source2 must be a valid URL.';return;}
if(row.status==='contacted'||row.status==='replied'){msg.textContent='Contact/reply status needs independently confirmed communication evidence; record it in Notes and update after verification.';return;}
save.disabled=true;try{const query=db.from('pn_capital_pipeline');const result=record?await query.update(row).eq('id',record.id).select('id').single():await query.insert(row).select('id').single();if(result.error)throw result.error;host.replaceChildren();await load();}catch(err){msg.textContent=err.message||'Save failed.';}finally{save.disabled=false;}});
}
async function mount(host){root=host;db=await window.PegSB.ready;if(!db||!await admin()){location.replace('/dashboard.html');return;}try{await load();}catch(err){root.textContent='Investor CRM unavailable: '+(err.message||String(err));}}
window.PegasusInvestorCRM={mount};
})();