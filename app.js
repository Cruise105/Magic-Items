'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY='omnithel-items-v1';
const RAR=['Common','Uncommon','Rare','Very Rare','Legendary','Artifact','Varies'];
const MINPT=10, MAXPT=16;
// ---------- state ----------
let S;
function defaults(){return{pcs:[1,2,3,4,5,6].map(n=>({id:'pc'+n,name:'Player '+n,limit:3})),inv:[],custom:[],edits:{},printQ:[],print:{pt:11,paper:'letter',showAtt:true},ui:{q:'',src:'',rar:'',att:'',sel:null,tab:'items',showGM:true}}}
function load(){try{const r=localStorage.getItem(KEY);if(r){const o=JSON.parse(r);return Object.assign(defaults(),o,{ui:Object.assign(defaults().ui,o.ui||{})})}}catch(e){}return defaults()}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){alert('Could not save to browser storage: '+e)}if(typeof syncNote==='function')syncNote();if(typeof publishSoon==='function')publishSoon()}
S=load();
// ---------- the item library ----------
// The public app ships the SRD items only (data.js). A DM's full library (their books' items, their Verdicts)
// lives in a private file in their own Google Drive and is kept on the device for offline use; when it's there,
// it replaces the SRD list. Nothing about it is in the public code.
var PUBLIC_SEED=window.SEED,LIB_FILE='omnithel-items-library.json',LIB={items:0,stamp:0,from:''};
var idbOpen=()=>new Promise((res,rej)=>{const r=indexedDB.open('omnithel-items-lib',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
var idbGet=k=>idbOpen().then(db=>new Promise(res=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})).catch(()=>null);
var idbPut=(k,v)=>idbOpen().then(db=>new Promise(res=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res(true);t.onerror=()=>res(false)})).catch(()=>false);
function useLibrary(lib,from){
  if(!lib||!Array.isArray(lib.items)||!lib.items.length)return false;
  window.SEED={sources:lib.sources||[],items:lib.items,pack:'library'};
  LIB={items:lib.items.length,stamp:lib.stamp||0,from};
  if(typeof buildItems==='function'){buildItems();if(typeof render==='function')render()}
  return true;
}
var libReady=idbGet('library').then(l=>useLibrary(l,'device'));
// ---------- items ----------
let ITEMS=[];const byId={};
function buildItems(){
  ITEMS=SEED.items.map(i=>S.edits[i.id]?Object.assign({},i,S.edits[i.id]):i).concat(S.custom.map(c=>S.edits[c.id]?Object.assign({},c,S.edits[c.id]):c));
  ITEMS.forEach(i=>byId[i.id]=i);
}
buildItems();
const SRC=()=>{const m=new Map();SEED.sources.forEach(s=>m.set(s.key,s.name||s.key));ITEMS.forEach(i=>{if(!m.has(i.source))m.set(i.source,i.source)});return m};
const needsAtt=i=>i.attune&&(i.attune.mode==='required'||i.attune.mode==='optional'||i.attune.mode==='unknown'&&i.verdict);
function attLine(i){const a=i.attune||{};if(a.mode==='required')return 'Requires attunement'+(a.by?' by '+a.by.replace(/^(a|an)\s+/i,m=>m):'');if(a.mode==='optional')return 'Attunement optional';return ''}
function rarLine(i){return [i.type,i.rarity].filter(Boolean).join(', ')}
// ---------- inventory ----------
const pc=id=>S.pcs.find(p=>p.id===id);
const holderName=h=>h==='stash'?'Party Stash':(pc(h)?.name||'?');
const attunedCount=h=>S.inv.filter(c=>c.holder===h&&c.attuned).length;
const uid=()=>Math.random().toString(36).slice(2,9);
function modal(html,onmount){const m=$('#modal');m.innerHTML='<div class="box">'+html+'</div>';m.hidden=false;m.onclick=e=>{if(e.target===m)closeModal()};onmount&&onmount(m)}
function closeModal(){$('#modal').hidden=true;$('#modal').innerHTML=''}
function addCopy(itemId,holder){S.inv.push({cid:uid(),itemId,holder,attuned:false,fails:{}});save()}
function holderOpts(sel){return '<option value="stash">Party Stash</option>'+S.pcs.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join('')}
function verdictHTML(i,onlyAtt){
  const v=i.verdict;if(!v)return '<p class="mu">No Verdict text written for this item yet. Use Edit to add it.</p>';
  let h='<div class="verdict">';
  if(v.kind==='flavor')h+=`<p class="pre"><em>${esc(v.flavor)}</em></p>`;
  else h+=`<p><b>Resonance Trait:</b> ${esc(v.trait)} · <b>DC ${esc(v.dc)}</b></p><p><b>Prompt:</b> ${esc(v.prompt)}</p><p><b>Success:</b> ${esc(v.success)}</p><p><b>Fail 1:</b> ${esc(v.fail1)}</p><p><b>Fail 2:</b> ${esc(v.fail2)}</p><p><b>Fail 3 (final):</b> ${esc(v.fail3)}</p>`;
  if(v.gm&&v.gm.length)h+=v.gm.map(g=>`<p class="mu pre"><b>GM:</b> ${esc(g)}</p>`).join('');
  return h+'</div>';
}
// ---------- attunement flow ----------
function startAttune(cid){
  const c=S.inv.find(x=>x.cid===cid),i=byId[c.itemId],p=pc(c.holder);if(!p)return;
  const fails=c.fails[p.id]||0;
  if(fails>=3)return;
  const n=attunedCount(p.id),over=n>=p.limit;
  const go=()=>{
    const v=i.verdict;
    if(!v||v.kind==='flavor'){
      modal(`<h2>${esc(i.name)}</h2><p class="mu">${esc(p.name)} attunes.</p>${v?`<p class="pre"><em>${esc(v.flavor)}</em></p>`:'<p class="mu">(no flavor text written)</p>'}<div class="row"><button class="pri" id="ok">Attuned</button><button id="cx">Cancel</button></div>`,m=>{$('#ok',m).onclick=()=>{c.attuned=true;save();closeModal();render()};$('#cx',m).onclick=closeModal});
    }else{
      modal(`<h2>${esc(i.name)}</h2><p class="mu">${esc(p.name)} · attempt ${fails+1} of 3 · <b>DC ${esc(v.dc)}</b> · ${esc(v.trait)}</p><p class="pre" style="font-size:18px"><em>${esc(v.prompt)}</em></p><div class="row"><button class="pri" id="ok">Success</button><button class="bad" id="no">Failed</button><button id="cx">Cancel</button></div>`,m=>{
        $('#cx',m).onclick=closeModal;
        $('#ok',m).onclick=()=>modal(`<h2>${esc(i.name)} — Success</h2><p class="pre" style="font-size:18px"><em>${esc(v.success)}</em></p><button class="pri" id="d">Done</button>`,m2=>{c.attuned=true;save();$('#d',m2).onclick=()=>{closeModal();render()}});
        $('#no',m).onclick=()=>{c.fails[p.id]=fails+1;save();const k=fails+1;modal(`<h2>${esc(i.name)} — Fail ${k}</h2><p class="pre" style="font-size:18px"><em>${esc(v['fail'+k])}</em></p>${k>=3?`<div class="warn"><b>${esc(p.name)} is now locked out of this item.</b> Another copy, or a different character, can still try.</div>`:`<p class="mu">${3-k} attempt${k===2?'':'s'} left.</p>`}<button class="pri" id="d">Done</button>`,m2=>{$('#d',m2).onclick=()=>{closeModal();render()}})};
      });
    }
  };
  if(over)modal(`<h2>Over the attunement limit</h2><div class="warn">${esc(p.name)} is already attuned to ${n} of ${p.limit} items. Attempting this would go over the limit.</div><div class="row"><button class="pri" id="y">Attempt anyway</button><button id="n">Cancel</button></div>`,m=>{$('#y',m).onclick=go;$('#n',m).onclick=closeModal});
  else go();
}
// ---------- views ----------
function filtered(){
  const u=S.ui,q=u.q.trim().toLowerCase();
  return ITEMS.filter(i=>{
    if(i.gm&&!u.showGM)return false;
    if(u.src&&i.source!==u.src)return false;
    if(u.rar&&i.rarity!==u.rar)return false;
    if(u.att==='req'&&!(i.attune&&i.attune.mode==='required'))return false;
    if(u.att==='no'&&i.attune&&i.attune.mode==='required')return false;
    if(q&&!(i.name+' '+i.type+' '+(i.desc||'')).toLowerCase().includes(q))return false;
    return true}).sort((a,b)=>a.name.localeCompare(b.name));
}
function itemsView(){
  const u=S.ui,srcs=SRC(),L=filtered(),sel=u.sel&&byId[u.sel];
  const lh=L.slice(0,400).map(i=>`<div class="li ${i.id===u.sel?'sel':''}" data-id="${esc(i.id)}"><span>${esc(i.name)}<br><small>${esc(i.type)}</small></span><small>${esc(i.rarity||'')}<br>${esc(i.source)}</small></div>`).join('');
  return `<div class="split"><div><div class="row"><input class="grow" id="q" placeholder="Search name, type, text…" value="${esc(u.q)}">
  <select id="fsrc"><option value="">All sources</option>${[...srcs].map(([k,n])=>`<option value="${esc(k)}" ${u.src===k?'selected':''}>${esc(k)} — ${esc(n)}</option>`)}</select>
  <select id="frar"><option value="">Any rarity</option>${RAR.map(r=>`<option ${u.rar===r?'selected':''}>${r}</option>`)}</select>
  <select id="fatt"><option value="">Any attunement</option><option value="req" ${u.att==='req'?'selected':''}>Requires attunement</option><option value="no" ${u.att==='no'?'selected':''}>No attunement</option></select></div>
  <div class="row" style="margin-top:6px"><span class="mu">${L.length} items${L.length>400?' (showing 400 — refine search)':''}</span><label style="margin:0"><input type="checkbox" id="gm" ${u.showGM?'checked':''} style="width:auto"> show GM-only twin entries</label><button class="sm" id="new">+ New item</button></div>
  <div class="list">${lh||'<div class="li mu">Nothing found</div>'}</div></div>
  <div id="detail">${sel?detail(sel):'<p class="mu">Select an item.</p>'}</div></div>`;
}
function detail(i){
  const copies=S.inv.filter(c=>c.itemId===i.id);
  return `<div class="card"><h2>${esc(i.name)}</h2><div class="mu">${esc(rarLine(i))}${i.tier?' · Tier '+i.tier:''}</div>
  <div style="margin:6px 0"><span class="tag">${esc(i.source)}</span>${attLine(i)?`<span class="tag">${esc(attLine(i))}</span>`:'<span class="tag">No attunement</span>'}${i.value?`<span class="tag">${esc(i.value)}</span>`:''}${i.weight?`<span class="tag">${esc(i.weight)}</span>`:''}</div>
  <p class="pre">${esc(i.desc)||'<span class="mu">(no description)</span>'}</p>
  ${needsAtt(i)||i.verdict?`<h3>The Item's Verdict</h3>${verdictHTML(i)}`:''}
  ${fxSection(i)}
  <h3>Inventory</h3>${copies.length?copies.map(c=>`<div class="copy">${esc(holderName(c.holder))}${c.attuned?' · <span class="att">attuned</span>':''}</div>`).join(''):'<p class="mu">Not in the inventory.</p>'}
  <div class="row"><select id="addto">${holderOpts('stash')}</select><button class="pri" id="addc">Add a copy</button><button id="edit">Edit</button><button id="toq">${S.printQ.includes(i.id)?'✓ In print queue':'+ Print queue'}</button>${i.id.startsWith('custom:')?'<button class="bad" id="del">Delete</button>':S.edits[i.id]?'<button id="revert">Revert to sheet</button>':''}</div></div>`;
}
// ---------- effects: what an item does to its holder's numbers on their character sheet ----------
// Read from the description by the suite core (core/effects.js); the DM's own list replaces that where they made one.
var FX=null;import('/core/effects.js').then(m=>{FX=m;if(S.ui.tab==='items')render()}).catch(()=>{});
function itemFx(i){if(Array.isArray(i.fx))return{fx:i.fx,own:true};if(!FX)return{fx:[],own:false};return{fx:FX.worksWhileCarried(i)?FX.parseEffects(i.desc):[],own:false,used:!FX.worksWhileCarried(i)}}
function fxSection(i){
  if(!FX)return'';
  const r=itemFx(i);
  const list=r.fx.length?`<ul class="fx">${r.fx.map(e=>`<li>${esc(FX.describe(e))}</li>`).join('')}</ul>`:`<p class="mu">${r.used?'Used up when it works (potion, scroll and the like), so nothing applies just by carrying it.':'Nothing on the character sheet changes.'}</p>`;
  return `<h3>On the character sheet</h3>${list}<p class="mu" style="font-size:13px">${r.own?'Your own list.':'Read from the description.'} ${needsAtt(i)?'Applies only while attuned.':'Applies while carried.'}</p><div class="row"><button class="sm" id="fxedit">Edit effects</button>${r.own?'<button class="sm" id="fxreset">Read from the description again</button>':''}</div>`;
}
const FX_KINDS=[['abil','Ability score +/−'],['abilSet','Ability score becomes'],['ac','AC'],['save','Saving throws'],['check','Ability checks'],['dc','Save DC'],['spellatk','Spell attacks'],['atk','Attack rolls'],['dmg','Damage rolls'],['speed','Speed (ft)'],['hpmax','Max HP'],['resist','Resistance'],['immune','Immunity'],['adv','Advantage (reminder)'],['dis','Disadvantage (reminder)'],['note','Note']];
const AB=[['str','Strength'],['dex','Dexterity'],['con','Constitution'],['int','Intelligence'],['wis','Wisdom'],['cha','Charisma']];
const FX_ON={abil:AB,abilSet:AB,save:[['all','All']].concat(AB),check:[['all','All']],dc:[['spell','Spells'],['ki','Ki / class features']],atk:[['self','With this item'],['ranged','Ranged weapons'],['all','All attacks']],dmg:[['self','With this item'],['ranged','Ranged weapons'],['all','All attacks']]};
const FX_V=new Set(['abil','abilSet','ac','save','check','dc','spellatk','atk','dmg','speed','hpmax']);
function setItemFx(i,fx){
  if(i.id.startsWith('custom:')){const c=S.custom.find(x=>x.id===i.id);if(fx)c.fx=fx;else delete c.fx}
  else{const e=Object.assign({},S.edits[i.id]||{});if(fx)e.fx=fx;else delete e.fx;if(Object.keys(e).length)S.edits[i.id]=e;else delete S.edits[i.id]}
  save();buildItems();render();
}
function fxEditor(i){
  let rows=JSON.parse(JSON.stringify(itemFx(i).fx));
  const draw=m=>{$('#fxrows',m).innerHTML=rows.map((e,k)=>{const on=FX_ON[e.k];
    return `<div class="row" style="margin-bottom:6px"><select data-k="${k}" data-f="k">${FX_KINDS.map(([v,l])=>`<option value="${v}" ${e.k===v?'selected':''}>${l}</option>`).join('')}</select>
    ${on?`<select data-k="${k}" data-f="on">${on.map(([v,l])=>`<option value="${v}" ${e.on===v?'selected':''}>${l}</option>`).join('')}</select>`:['resist','immune'].includes(e.k)?`<input data-k="${k}" data-f="on" placeholder="damage type" value="${esc(e.on||'')}" style="width:130px">`:''}
    ${FX_V.has(e.k)?`<input data-k="${k}" data-f="v" type="number" value="${esc(e.v??'')}" style="width:80px">`:''}
    ${['adv','dis','note'].includes(e.k)?`<input class="grow" data-k="${k}" data-f="note" placeholder="${e.k==='note'?'what to show':'on what'}" value="${esc(e.note||'')}">`:''}
    <button class="sm bad" data-del="${k}" aria-label="Remove">✕</button></div>`}).join('')||'<p class="mu">No effects.</p>'};
  modal(`<h2>Effects: ${esc(i.name)}</h2><p class="mu">What this item does to its holder's numbers on their character sheet${needsAtt(i)?', while attuned':''}.</p><div id="fxrows"></div>
  <div class="row" style="margin-top:8px"><button id="fxadd">Add an effect</button><div class="grow"></div><button class="pri" id="fxsave">Save</button><button id="fxx">Cancel</button></div>`,m=>{
    draw(m);
    m.oninput=m.onchange=ev=>{const el=ev.target;if(el.dataset.k==null)return;const e=rows[+el.dataset.k],f=el.dataset.f;
      if(f==='k'){e.k=el.value;e.on=FX_ON[e.k]?FX_ON[e.k][0][0]:undefined;draw(m);return}
      e[f]=f==='v'?(el.value===''?'':Number(el.value)):el.value};
    m.onclick=ev=>{const d=ev.target.closest('[data-del]');if(d){rows.splice(+d.dataset.del,1);draw(m)}};
    $('#fxadd',m).onclick=()=>{rows.push({k:'ac',v:1});draw(m)};
    $('#fxx',m).onclick=closeModal;
    $('#fxsave',m).onclick=()=>{const clean=rows.map(e=>{const o={k:e.k};if(e.on!=null&&e.on!=='')o.on=e.on;if(FX_V.has(e.k))o.v=Number(e.v)||0;if(e.note)o.note=e.note;return o});setItemFx(i,clean);closeModal()};
  });
}
function partyView(){
  const col=(h,name,p)=>{
    const cs=S.inv.filter(c=>c.holder===h);
    const n=p?attunedCount(h):0;
    return `<div class="card"><div class="row"><h2 class="grow" style="font-size:19px">${esc(name)}</h2>${p?`<button class="sm" data-ren="${h}">Edit</button>`:''}</div>
    ${p?`<div class="row"><span class="${n>p.limit?'locked':n===p.limit?'att':'mu'}">${n} of ${p.limit} attuned</span><button class="sm" data-lim="${h}:-1">−</button><button class="sm" data-lim="${h}:1">+</button></div>`:''}
    ${cs.map(c=>{const i=byId[c.itemId]||{name:'(missing)'};const f=p?(c.fails[h]||0):0;const locked=f>=3;
      return `<div class="copy"><b><a href="#" data-open="${esc(c.itemId)}" style="color:inherit">${esc(i.name)}</a></b> <span class="mu">${esc(i.rarity||'')}</span><br>
      ${p&&needsAtt(i)?(c.attuned?'<span class="att">Attuned</span>':locked?'<span class="locked">Locked out</span>':'<span class="mu">Not attuned</span>')+` <span title="failed attempts">${[0,1,2].map(k=>`<span class="pip ${k<f?'f':''}"></span>`).join('')}</span>`:''}
      <div class="row" style="margin-top:4px">${p&&needsAtt(i)&&!c.attuned&&!locked?`<button class="sm pri" data-att="${c.cid}">Attune…</button>`:''}${c.attuned?`<button class="sm" data-un="${c.cid}">Un-attune</button>`:''}
      <select class="sm" data-mv="${c.cid}" style="padding:3px"><option value="">Move to…</option>${h!=='stash'?'<option value="stash">Party Stash</option>':''}${S.pcs.filter(x=>x.id!==h).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`)}</select>
      <button class="sm" data-pq="${esc(c.itemId)}">+ Print</button><button class="sm bad" data-rm="${c.cid}">✕</button></div></div>`}).join('')||'<p class="mu">Empty</p>'}</div>`;
  };
  const shown=shownPcs(), chars=suiteChars(), free=chars.filter(ch=>!S.pcs.some(p=>p.charId===ch.id&&S.inv.some(c=>c.holder===p.id)));
  const unlinked=shown.filter(p=>!p.charId);
  const linkBox=chars.length&&unlinked.length?`<div class="card" style="margin-bottom:10px"><h2 style="font-size:17px">Link your players to their characters</h2><p class="mu">These players aren't tied to a character from the Character Sheet yet. Pick who each one is: their items and attunement move to that character, by permanent ID from then on.</p>${unlinked.map(p=>`<div class="row"><b class="grow">${esc(p.name)}</b><span class="mu">${S.inv.filter(c=>c.holder===p.id).length} items</span><select class="sm" data-linkpc="${p.id}"><option value="">Choose a character…</option>${free.map(ch=>`<option value="${esc(ch.id)}">${esc(ch.name)}</option>`).join('')}</select></div>`).join('')}</div>`:'';
  return `<div class="row" style="margin-bottom:8px"><button class="pri" id="addpc">+ Add character</button></div>${chars.length?'<p class="mu">Players come from the current campaign\'s characters in the Character Sheet app; their items reach their sheet the moment they change.</p>':''}${linkBox}<p class="mu">Failed attempts are tracked per character, per copy. Moving a copy clears its attunement; a character who locked out of that copy stays locked out if it ever returns.</p><div class="cols">${col('stash','Party Stash',null)}${shown.map(p=>col(p.id,p.name,p)).join('')}</div>`;
}
// ---------- print ----------
function attSheet(i){const a=i.attune||{};if(a.mode==='required')return a.by?'By '+a.by:'Yes';if(a.mode==='optional')return 'Optional';return 'No'}
function cardHTML(i){
  const rar=i.rarity?i.rarity+(i.tier?' (Tier '+i.tier+')':''):'';
  return `<div class="pcard"><div class="n">${esc(i.name)}</div><div class="r2"><span>${esc(i.type)}</span><span>${esc(rar)}</span></div>${S.print.showAtt?`<div class="r1">Attunement: ${esc(attSheet(i))}</div>`:''}<div class="r2"><span>Value: <span${S.print.dimVal===false?'':` style="color:${S.print.valColor||'#b7b7b7'}"`}>${esc(i.value||'?')}</span></span><span>Weight: ${esc(i.weight||'?')}</span></div><div class="d">${esc(i.desc)}</div></div>`;
}
let lastPages=0,lastOver=0;
function buildPages(){
  const host=$('#pages');if(!host)return;
  const pr=S.print,ids=S.printQ.filter(x=>byId[x]&&!byId[x].gm);
  const a4=pr.paper==='a4';
  const pageH=(a4?297/25.4:11)*96,padPx=.4*96,avail=pageH-2*padPx-14;
  // measure in an unscaled sandbox
  const sb=document.createElement('div');sb.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden';
  sb.innerHTML=`<div class="page ${a4?'a4':''}" style="height:auto;font-size:${pr.pt}pt"><div class="prow">${ids.map(id=>cardHTML(byId[id])).join('')}</div></div>`;
  document.body.appendChild(sb);
  const cards=[...sb.querySelectorAll('.pcard')];
  // rows: pair cards; row height = max of two
  const rows=[];for(let k=0;k<cards.length;k+=2){rows.push({a:ids[k],b:ids[k+1],h:Math.max(cards[k].offsetHeight,cards[k+1]?cards[k+1].offsetHeight:0)+.14*96})}
  document.body.removeChild(sb);
  const pages=[];let cur=[],used=0,over=0;
  rows.forEach(r=>{if(used+r.h>avail&&cur.length){pages.push(cur);cur=[];used=0}if(r.h>avail)over++;cur.push(r);used+=r.h});
  if(cur.length)pages.push(cur);
  lastPages=pages.length;lastOver=over;
  const wrapW=host.clientWidth-24||800,pw=(a4?210/25.4:8.5)*96,sc=Math.min(1,wrapW/pw);
  host.innerHTML=pages.map((pg,n)=>`<div class="pagebox" style="width:${pw*sc}px;height:${pageH*sc}px"><div class="page ${a4?'a4':''}" style="font-size:${pr.pt}pt;transform:scale(${sc})">${pg.map(r=>`<div class="prow">${cardHTML(byId[r.a])}${r.b?cardHTML(byId[r.b]):'<div></div>'}</div>`).join('')}<div class="pg-n">Page ${n+1} of ${pages.length}</div></div></div>`).join('')||'<p style="color:#fff">Nothing in the print queue.</p>';
  const st=$('#pstat');if(st)st.innerHTML=`${ids.length} card${ids.length===1?'':'s'} · ${pages.length} page${pages.length===1?'':'s'}`+(over?` · <span class="locked">${over} card${over>1?'s are':' is'} taller than a page — it will print cut off. Lower the text size or shorten its description.</span>`:'');
}
function printView(){
  const pr=S.print,q=S.printQ.filter(x=>byId[x]),skipped=q.filter(x=>byId[x].gm).length;
  return `<div class="card noprint"><div class="row"><b>Print queue (${q.length})</b><button class="sm" id="clrq">Clear</button>
  <div class="grow"></div>
  <label style="margin:0">Add everything held by</label><select id="qh" style="width:auto"><option value="">…</option><option value="stash">Party Stash</option>${S.pcs.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`)}</select></div>
  <div class="row" style="margin-top:8px">${q.map(id=>`<span class="tag" style="font-size:14px">${esc(byId[id].name)} <a href="#" data-dq="${esc(id)}" style="color:var(--bad)">✕</a></span>`).join('')||'<span class="mu">Add items from the Items tab (+ Print queue) or by holder above.</span>'}</div></div>
  <div class="card noprint"><div class="row"><label style="margin:0">Text size</label><button class="sm" id="pm">−</button><b id="ptv">${pr.pt}pt</b><button class="sm" id="pp">+</button>
  <span class="mu">(minimum ${MINPT}pt)</span>
  <select id="paper" style="width:auto"><option value="letter" ${pr.paper==='letter'?'selected':''}>Letter</option><option value="a4" ${pr.paper==='a4'?'selected':''}>A4</option></select>
  <label style="margin:0"><input type="checkbox" id="sa" ${pr.showAtt?'checked':''} style="width:auto"> show attunement line</label>
  <label style="margin:0"><input type="checkbox" id="dv" ${pr.dimVal===false?'':'checked'} style="width:auto"> faint value</label>
  <select id="vc" style="width:auto"><option value="#b7b7b7" ${(pr.valColor||'#b7b7b7')==='#b7b7b7'?'selected':''}>Like the sheet</option><option value="#c4c4c4" ${pr.valColor==='#c4c4c4'?'selected':''}>Fainter</option><option value="#cfcfcf" ${pr.valColor==='#cfcfcf'?'selected':''}>Faintest</option></select>
  <div class="grow"></div><button class="pri" id="doprint">🖨 Print</button></div>
  <div id="pstat" class="mu" style="margin-top:6px"></div>${skipped?`<div class="warn">${skipped} GM-only twin entr${skipped>1?'ies are':'y is'} in the queue and will NOT print (they reveal curses/secrets).</div>`:''}
  <p class="mu" style="margin:4px 0 0;font-size:13px">The preview below is exactly what prints: same size, same page breaks. Cards never split across pages. Player-safe fields only — no Verdict text.</p></div>
  <div id="printout"><div class="pagewrap" id="pages"></div></div>`;
}
function dataView(){
  return syncCard()+`<div class="card"><h2>Backup</h2><p class="mu">This app is the master copy. Everything (inventory, fail counts, limits, edits, new items, print settings) lives in this browser, so export a backup regularly.</p>
  <div class="row"><button class="pri" id="exp">Export backup (.json)</button><label class="sm" style="margin:0">Import backup: <input type="file" id="imp" accept=".json" style="width:auto"></label></div>
  <h3>Items only</h3><div class="row"><button id="expc">Export my custom + edited items</button></div>
  <h3>Reset</h3><button class="bad" id="reset">Erase all app data in this browser</button></div>
  <div class="card"><h2>Item library</h2><p class="mu">${LIB.items?`Your own library: ${LIB.items} items, kept privately in your Google Drive and on this device.`:`The SRD items (${SEED.items.length}), free to use under the SRD's Creative Commons license. Your own library, if you have one, loads from your Google Drive when you connect.`} ${S.custom.length} custom · ${Object.keys(S.edits).length} edited.</p>
  <div class="row"><label class="sm" style="margin:0">Import a library file: <input type="file" id="libimp" accept=".json" style="width:auto"></label>${LIB.items?'<button id="libexp">Export my library</button>':''}</div>
  <p class="mu" style="font-size:13px">Importing replaces the library on this device and in your Drive (your inventory, custom items and edits stay).</p></div>`;
}
function pcForm(id){
  const p=id?pc(id):{id:'pc'+uid(),name:'',limit:3};
  const n=id?S.inv.filter(c=>c.holder===id).length:0;
  modal(`<h2>${id?'Edit character':'Add character'}</h2><label>Name</label><input id="pn" value="${esc(p.name)}"><label>Attunement limit</label><input id="pl" type="number" min="0" value="${p.limit}">
  <div class="row" style="margin-top:12px"><button class="pri" id="ps">Save</button><button id="px">Cancel</button>${id?'<div class="grow"></div><button class="bad" id="pr">Remove character</button>':''}</div>`,m=>{
    $('#px',m).onclick=closeModal;
    $('#ps',m).onclick=()=>{const nm=$('#pn',m).value.trim();if(!nm)return alert('Name is required');p.name=nm;p.limit=Math.max(0,parseInt($('#pl',m).value)||0);if(!id)S.pcs.push(p);save();closeModal();render()};
    if(id)$('#pr',m).onclick=()=>{if(!confirm(`Remove ${p.name}?`+(n?` Their ${n} item${n>1?'s':''} will move to the Party Stash (attunement cleared).`:'')))return;S.inv.forEach(c=>{if(c.holder===id){c.holder='stash';c.attuned=false}});S.pcs=S.pcs.filter(x=>x.id!==id);save();closeModal();render()};
  });
}
// ---------- edit form ----------
function editForm(i){
  const isNew=!i, it=i||{id:'custom:'+uid(),name:'',source:'Homebrew',group:'core',type:'Wondrous Item',rarity:'Rare',attune:{mode:'none',by:''},value:'',weight:'',desc:''};
  const v=it.verdict||{kind:'flavor'};
  const f=(k,l,val,tag)=>`<label>${l}</label>${tag==='ta'?`<textarea data-f="${k}">${esc(val)}</textarea>`:`<input data-f="${k}" value="${esc(val)}">`}`;
  modal(`<h2>${isNew?'New item':'Edit item'}</h2>
  ${f('name','Name',it.name)}
  <div class="row"><div class="grow"><label>Source / tab</label><input data-f="source" list="srcl" value="${esc(it.source)}"><datalist id="srcl">${[...SRC().keys()].map(k=>`<option>${esc(k)}`).join('')}</datalist></div>
  <div class="grow">${f('type','Type',it.type)}</div>
  <div class="grow"><label>Rarity</label><select data-f="rarity">${RAR.map(r=>`<option ${it.rarity===r?'selected':''}>${r}</option>`)}</select></div></div>
  <div class="row"><div class="grow"><label>Attunement</label><select data-f="amode">${['none','required','optional'].map(m=>`<option ${it.attune.mode===m?'selected':''}>${m}</option>`)}</select></div>
  <div class="grow">${f('aby','Attunement restriction (e.g. a Wizard)',it.attune.by)}</div></div>
  <div class="row"><div class="grow">${f('value','Value',it.value)}</div><div class="grow">${f('weight','Weight',it.weight)}</div></div>
  ${f('desc','Description',it.desc,'ta')}
  <h3>The Item's Verdict</h3>
  <select data-f="vkind"><option value="none" ${!it.verdict?'selected':''}>None yet</option><option value="flavor" ${v.kind==='flavor'&&it.verdict?'selected':''}>Flavor only (Common/Uncommon)</option><option value="check" ${v.kind==='check'?'selected':''}>Resonance check (Rare+)</option></select>
  <div id="vf">${f('flavor','Flavor line',v.flavor||'','ta')}</div>
  <div id="vc">${f('dc','DC',v.dc||'')}${f('trait','Resonance Trait',v.trait||'')}${f('prompt','Prompt (read before the roll)',v.prompt||'','ta')}${f('success','Success',v.success||'','ta')}${f('fail1','Fail 1',v.fail1||'','ta')}${f('fail2','Fail 2',v.fail2||'','ta')}${f('fail3','Fail 3 (final)',v.fail3||'','ta')}</div>
  ${f('gm','GM notes',(v.gm||[]).join('\n\n'),'ta')}
  <div class="row" style="margin-top:12px"><button class="pri" id="sv">Save</button><button id="cx">Cancel</button></div>`,m=>{
    const upd=()=>{const k=$('[data-f=vkind]',m).value;$('#vf',m).style.display=k==='flavor'?'':'none';$('#vc',m).style.display=k==='check'?'':'none'};
    $('[data-f=vkind]',m).onchange=upd;upd();$('#cx',m).onclick=closeModal;
    $('#sv',m).onclick=()=>{
      const g=k=>$(`[data-f=${k}]`,m).value.trim();
      if(!g('name'))return alert('Name is required');
      const o={name:g('name'),source:g('source')||'Homebrew',type:g('type'),rarity:g('rarity'),attune:{mode:g('amode'),by:g('aby')},value:g('value'),weight:g('weight'),desc:$('[data-f=desc]',m).value.trim()};
      const k=g('vkind');
      if(k==='none')o.verdict=null;
      else{const vv={kind:k};if(k==='flavor')vv.flavor=g('flavor');else{vv.dc=+g('dc')||g('dc');['trait','prompt','success','fail1','fail2','fail3'].forEach(x=>vv[x]=g(x))}
        const gm=g('gm');if(gm)vv.gm=gm.split(/\n\n+/);o.verdict=vv}
      if(isNew){S.custom.push(Object.assign({},it,o));S.ui.sel=it.id}else if(it.id.startsWith('custom:')){Object.assign(S.custom.find(c=>c.id===it.id),o)}else S.edits[it.id]=Object.assign(S.edits[it.id]&&S.edits[it.id].fx?{fx:S.edits[it.id].fx}:{},o);
      save();buildItems();closeModal();render()};
  });
}
// ---------- render + events ----------
function render(){
  const t=S.ui.tab;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  const app=$('#app');
  app.innerHTML=t==='items'?itemsView():t==='party'?partyView():t==='print'?printView():dataView();
  if(t==='print')requestAnimationFrame(buildPages);
  bind();
}
// ---------- the suite: players are the current campaign's characters (by permanent id), and each character's
// items go to their sheet over the live link the moment they change ----------
const suiteChars=()=>(core&&core.party?core.party():[]);
const normNm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
const holds=id=>S.inv.some(c=>c.holder===id);
// Who shows on the Party tab: this campaign's characters, plus anyone not linked yet who still holds items
function shownPcs(){
  const chars=suiteChars();if(!chars.length)return S.pcs;
  const ids=new Set(chars.map(c=>c.id));
  return S.pcs.filter(p=>p.charId?ids.has(p.charId):(holds(p.id)||!/^Player \d$/.test(p.name)));
}
// Tie players to characters: by id, else once by the same name; add the ones missing; names follow the sheet
function linkParty(){
  const chars=suiteChars();if(!chars.length)return false;let ch=false;
  for(const c of chars){
    let p=S.pcs.find(x=>x.charId===c.id);
    if(!p){const n=normNm(c.name);p=S.pcs.find(x=>!x.charId&&n&&normNm(x.name)===n);if(p){p.charId=c.id;ch=true}}
    if(!p){S.pcs.push({id:'pc'+uid(),name:c.name||'Unnamed',limit:3,charId:c.id});ch=true;continue}
    if(c.name&&p.name!==c.name){p.name=c.name;ch=true}
  }
  // untouched placeholders (Player 1–6 holding nothing) aren't needed once the real characters are here
  const before=S.pcs.length;S.pcs=S.pcs.filter(p=>p.charId||holds(p.id)||!/^Player \d$/.test(p.name));
  return ch||S.pcs.length!==before;
}
// Move an unlinked player's items and attunement onto a character's player, then drop the old one
function linkPc(oldId,charId){
  const old=S.pcs.find(p=>p.id===oldId);if(!old)return;
  let tgt=S.pcs.find(p=>p.charId===charId&&p.id!==oldId);
  if(!tgt){old.charId=charId;const c=suiteChars().find(x=>x.id===charId);if(c)old.name=c.name;return}
  S.inv.forEach(c=>{if(c.holder===oldId)c.holder=tgt.id;if(c.fails&&c.fails[oldId]!=null){c.fails[tgt.id]=Math.max(c.fails[tgt.id]||0,c.fails[oldId]);delete c.fails[oldId]}});
  tgt.limit=Math.max(tgt.limit,old.limit);S.pcs=S.pcs.filter(p=>p.id!==oldId);
}
async function suiteRefresh(token){
  await coreReady;if(!core||!core.loadSuite||!token)return;
  try{await core.loadSuite(token);await core.loadParty(token)}catch(e){return}
  if(linkParty()){save();render()}else publishSoon();
}
var sentMi=new Map(),pubT=null;
function publishSoon(){clearTimeout(pubT);pubT=setTimeout(publishItems,400)}
async function publishItems(){
  await coreReady;if(!core||!core.cachedParty)return;
  const[V,L]=await Promise.all([core.views&&core.views(),core.live&&core.live()]);if(!V||!L)return;
  const keys=new Map(core.cachedParty().filter(c=>c.liveKey).map(c=>[c.id,c.liveKey]));
  const seed=new Map(SEED.items.map(i=>[i.id,i]));
  for(const p of S.pcs){
    if(!p.charId||!keys.has(p.charId))continue;
    const v=V.miView({state:S},seed,p);if(!v)continue;
    const k=JSON.stringify(v);if(sentMi.get(p.id)===k)continue;
    if(await L.channel(keys.get(p.charId),'mi',{magicItems:v.items,attuneMax:v.limit}))sentMi.set(p.id,k);
  }
}
// ---------- Google Drive sync (hidden app-data file, same idea as the other apps) ----------
const SK='omnithel-sync-v1';let Y={};try{Y=JSON.parse(localStorage.getItem(SK)||'{}')}catch(e){}
const saveY=()=>{try{localStorage.setItem(SK,JSON.stringify(Y))}catch(e){}};
const DEFAULT_CID='150155066546-k6e9l4c0fbmel2tdfkv4c4gs41bqd847.apps.googleusercontent.com';
if(!Y.clientId)Y.clientId=DEFAULT_CID;
const FILE='omnithel-items.json',SCOPE='https://www.googleapis.com/auth/drive.appdata';
const hsh=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return String(h)};
const payload=()=>{const{ui,...rest}=S;return JSON.stringify(rest)};
let tok=null,tokExp=0,syncMsg='',pushT=null,busy=false;
// Suite core: one shared Google sign-in for every app on this site. If it can't load, this app signs in on its own as before.
var core=null;var coreReady=import('/core/suite.js').then(m=>{core=m}).catch(()=>{});
const setMsg=m=>{syncMsg=m;const e=$('#syncpill');if(e)e.textContent=m;const d=$('#syncdet');if(d)d.textContent=m};
const changed=()=>hsh(payload())!==Y.lastHash;
function syncNote(){if(!Y.connected)return;if(changed()){setMsg('● unsynced changes');clearTimeout(pushT);pushT=setTimeout(()=>{if(tok&&Date.now()<tokExp-60000)doSync(true)},4000)}}
function loadGIS(){return new Promise((res,rej)=>{if(window.google&&google.accounts&&google.accounts.oauth2)return res();const sc=document.createElement('script');sc.src='https://accounts.google.com/gsi/client';sc.onload=res;sc.onerror=()=>rej('Could not reach Google (offline?)');document.head.appendChild(sc)})}
async function getToken(interactive){
  if(tok&&Date.now()<tokExp-60000)return tok;
  await coreReady;
  // another app on the site already signed in with what this app needs: use that instead of asking again
  const sh=core&&Y.clientId===core.CLIENT_ID?core.signedIn(SCOPE,{app:'magic-items'}):null;
  if(sh&&Date.now()<sh.exp-60000){tok=sh.value;tokExp=sh.exp;return tok}
  // stay signed in through the suite's key keeper when it's set up (falls back to the one-hour sign-in)
  if(interactive&&core&&core.keeperReady&&core.keeperReady()&&Y.clientId===core.CLIENT_ID){try{const t=await core.signInLong(SCOPE,{app:'magic-items'});tok=t.value;tokExp=t.exp;return tok}catch(e){if(/closed before/.test(e.message))throw e;console.warn('key keeper',e)}}
  await loadGIS();
  return new Promise((res,rej)=>{
    const c=google.accounts.oauth2.initTokenClient({client_id:Y.clientId,scope:SCOPE,callback:r=>{if(r.error)return rej(r.error);tok=r.access_token;tokExp=Date.now()+r.expires_in*1000;if(core&&Y.clientId===core.CLIENT_ID)core.share(r,{app:'magic-items'});res(tok)},error_callback:e=>rej(e.type||'sign-in cancelled')});
    c.requestAccessToken({prompt:interactive?(Y.connected?'':'consent'):''});
  });
}
async function gapi(url,opt={}){const r=await fetch(url,Object.assign({},opt,{headers:Object.assign({Authorization:'Bearer '+tok},opt.headers||{})}));if(r.status===401){core?.forget(tok);tok=null;tokExp=0}if(!r.ok)throw new Error('Drive '+r.status+': '+(await r.text()).slice(0,120));return r}
async function findRemote(){const r=await gapi('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q='+encodeURIComponent("name='"+FILE+"'")+'&fields=files(id)');const j=await r.json();return j.files[0]?.id||null}
async function pull(id){const r=await gapi('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media');return r.json()}
async function push(id,stamp){
  const body=JSON.stringify({app:'omnithel-items',stamp,state:JSON.parse(payload())});
  if(id){await gapi('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body});return id}
  const b='xx'+uid();
  const r=await gapi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body:`--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:FILE,parents:['appDataFolder']})}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`});
  return (await r.json()).id;
}
function applyRemote(rem){const ui=S.ui;S=Object.assign(defaults(),rem.state,{ui});buildItems();save();}
// Your item library in your Drive: download it when it changed, or (the first time, on the device that still has
// the full list) put it there
async function syncLibrary(){
  await libReady;
  const q=encodeURIComponent("name='"+LIB_FILE+"'");
  const f=(await (await gapi('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q='+q+'&fields=files(id,modifiedTime)&pageSize=1')).json()).files?.[0];
  if(f){
    if(f.modifiedTime===Y.libModified&&LIB.items)return;
    const lib=await (await gapi('https://www.googleapis.com/drive/v3/files/'+f.id+'?alt=media')).json();
    if(lib&&lib.app==='omnithel-items-library'){await idbPut('library',lib);useLibrary(lib,'drive');Y.libModified=f.modifiedTime;saveY()}
    return;
  }
  // nothing in Drive yet: this device has the full list (the public code before it went SRD-only, or an imported file)
  const full=LIB.items?window.SEED:(PUBLIC_SEED&&PUBLIC_SEED.pack!=='srd'?PUBLIC_SEED:null);
  if(!full)return;
  await putLibrary({app:'omnithel-items-library',v:1,stamp:Date.now(),sources:full.sources||[],items:full.items});
  setMsg('✓ your item library is saved in your Drive');
}
async function putLibrary(lib){
  const body=JSON.stringify(lib);
  const q=encodeURIComponent("name='"+LIB_FILE+"'");
  const f=(await (await gapi('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q='+q+'&fields=files(id)&pageSize=1')).json()).files?.[0];
  let r;
  if(f)r=await gapi('https://www.googleapis.com/upload/drive/v3/files/'+f.id+'?uploadType=media&fields=modifiedTime',{method:'PATCH',headers:{'Content-Type':'application/json'},body});
  else{const b='xx'+uid();r=await gapi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=modifiedTime',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body:`--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:LIB_FILE,parents:['appDataFolder']})}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`})}
  const m=await r.json();Y.libModified=m.modifiedTime;saveY();
  await idbPut('library',lib);useLibrary(lib,'drive');
}
async function doSync(silent){
  if(busy||!Y.clientId)return;busy=true;
  try{
    setMsg('syncing…');await getToken(!silent);suiteRefresh(tok);
    await syncLibrary().catch(e=>console.warn('item library',e));
    const id=await findRemote();let lc=changed();
    const pristine=!S.inv.length&&!S.custom.length&&!Object.keys(S.edits).length&&!S.printQ.length&&S.pcs.every(p=>/^Player \d$/.test(p.name)&&p.limit===3);
    if(!Y.remoteStamp&&pristine)lc=false;
    if(!id){const st=Date.now(),fid=await push(null,st);Y.fileId=fid;Y.remoteStamp=st;Y.lastHash=hsh(payload());saveY();setMsg('✓ uploaded to Drive');render();return}
    const rem=await pull(id),rc=rem.stamp!==Y.remoteStamp;
    const done=(m,stamp)=>{Y.remoteStamp=stamp;Y.lastHash=hsh(payload());saveY();setMsg('✓ '+m+' '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));if(!silent||m.startsWith('pulled'))render()};
    const doPush=async()=>{const st=Date.now();await push(id,st);done('synced',st)};
    const doPull=()=>{applyRemote(rem);done('pulled newer data',rem.stamp)};
    if(!lc&&!rc){setMsg('✓ up to date');return}
    if(rc&&!lc)doPull();
    else if(lc&&!rc)await doPush();
    else await new Promise(res=>modal(`<h2>Both changed</h2><div class="warn">This device and Google Drive both have changes since the last sync. One side will be replaced.</div><div class="row"><button class="pri" id="a">Use this device (overwrite Drive)</button><button id="b">Use Drive (overwrite this device)</button><button id="c">Decide later</button></div>`,m=>{$('#a',m).onclick=async()=>{closeModal();await doPush();res()};$('#b',m).onclick=()=>{closeModal();doPull();res()};$('#c',m).onclick=()=>{closeModal();setMsg('● conflict — tap Sync');res()}}));
  }catch(e){setMsg(silent?'● unsynced — tap Sync':'⚠ '+(e.message||e));}
  finally{busy=false}
}
function syncCard(){return `<div class="card"><h2>Google Drive sync</h2><p class="mu">Keeps one copy of your data in a hidden app folder in your Google Drive so the tablet and PC stay matched (inventory, fail counts, limits, edits, new items). Each device keeps its own filters and selection. If both sides changed, it asks which one wins.</p>
 <details class="mu"><summary>Advanced</summary><label>Google OAuth client ID (already set to the one your Bestiary uses)</label><input id="cid" value="${esc(Y.clientId||'')}"></details>
 <div class="row" style="margin-top:8px"><button class="pri" id="conn">${Y.connected?'Sync now':'Connect Google Drive'}</button>${Y.connected?'<button id="disc">Disconnect</button>':''}<span id="syncdet" class="mu">${esc(syncMsg)}</span></div></div>`}
const dl=(name,obj)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,1)],{type:'application/json'}));a.download=name;a.click()};
function bind(){
  const A=$('#app');
  const on=(sel,ev,fn)=>A.querySelectorAll(sel).forEach(e=>e['on'+ev]=fn);
  const t=S.ui.tab;
  if(t==='items'){
    let tm;$('#q').oninput=e=>{S.ui.q=e.target.value;clearTimeout(tm);tm=setTimeout(()=>{const p=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p)},200)};
    $('#fsrc').onchange=e=>{S.ui.src=e.target.value;render()};$('#frar').onchange=e=>{S.ui.rar=e.target.value;render()};$('#fatt').onchange=e=>{S.ui.att=e.target.value;render()};
    $('#gm').onchange=e=>{S.ui.showGM=e.target.checked;render()};
    $('#new').onclick=()=>editForm(null);
    on('.li[data-id]','click',e=>{S.ui.sel=e.currentTarget.dataset.id;save();render()});
    const sel=S.ui.sel&&byId[S.ui.sel];
    if(sel){
      $('#addc').onclick=()=>{addCopy(sel.id,$('#addto').value);render()};
      $('#edit').onclick=()=>editForm(sel);
      const fe=$('#fxedit');if(fe)fe.onclick=()=>fxEditor(sel);
      const fr=$('#fxreset');if(fr)fr.onclick=()=>setItemFx(sel,null);
      $('#toq').onclick=()=>{const q=S.printQ,k=q.indexOf(sel.id);k<0?q.push(sel.id):q.splice(k,1);save();render()};
      const d=$('#del');if(d)d.onclick=()=>{if(confirm('Delete this custom item and its copies?')){S.custom=S.custom.filter(c=>c.id!==sel.id);S.inv=S.inv.filter(c=>c.itemId!==sel.id);S.printQ=S.printQ.filter(x=>x!==sel.id);S.ui.sel=null;save();buildItems();render()}};
      const r=$('#revert');if(r)r.onclick=()=>{delete S.edits[sel.id];save();buildItems();render()};
    }
  }
  if(t==='party'){
    on('[data-linkpc]','change',e=>{const v=e.currentTarget.value;if(!v)return;linkPc(e.currentTarget.dataset.linkpc,v);linkParty();save();render()});
    on('[data-att]','click',e=>startAttune(e.currentTarget.dataset.att));
    on('[data-un]','click',e=>{S.inv.find(c=>c.cid===e.currentTarget.dataset.un).attuned=false;save();render()});
    on('[data-mv]','change',e=>{const c=S.inv.find(c=>c.cid===e.currentTarget.dataset.mv),to=e.target.value;if(!to)return;c.holder=to;c.attuned=false;save();render()});
    on('[data-rm]','click',e=>{if(confirm('Remove this copy (its fail counts are lost)?')){S.inv=S.inv.filter(c=>c.cid!==e.currentTarget.dataset.rm);save();render()}});
    on('[data-pq]','click',e=>{const id=e.currentTarget.dataset.pq;if(!S.printQ.includes(id))S.printQ.push(id);save();e.currentTarget.textContent='✓ queued'});
    on('[data-open]','click',e=>{e.preventDefault();S.ui.sel=e.currentTarget.dataset.open;S.ui.tab='items';render()});
    on('[data-lim]','click',e=>{const[h,d]=e.currentTarget.dataset.lim.split(':');const p=pc(h);p.limit=Math.max(0,p.limit+ +d);save();render()});
    on('[data-ren]','click',e=>pcForm(e.currentTarget.dataset.ren));
    $('#addpc').onclick=()=>pcForm(null);
  }
  if(t==='print'){
    $('#pm').onclick=()=>{S.print.pt=Math.max(MINPT,S.print.pt-.5);save();$('#ptv').textContent=S.print.pt+'pt';buildPages()};
    $('#pp').onclick=()=>{S.print.pt=Math.min(MAXPT,S.print.pt+.5);save();$('#ptv').textContent=S.print.pt+'pt';buildPages()};
    $('#paper').onchange=e=>{S.print.paper=e.target.value;save();buildPages()};
    $('#vc').onchange=e=>{S.print.valColor=e.target.value;save();buildPages()};
    $('#dv').onchange=e=>{S.print.dimVal=e.target.checked;save();buildPages()};
    $('#sa').onchange=e=>{S.print.showAtt=e.target.checked;save();buildPages()};
    $('#doprint').onclick=()=>window.print();
    $('#clrq').onclick=()=>{S.printQ=[];save();render()};
    on('[data-dq]','click',e=>{e.preventDefault();S.printQ=S.printQ.filter(x=>x!==e.currentTarget.dataset.dq);save();render()});
    $('#qh').onchange=e=>{const h=e.target.value;if(!h)return;S.inv.filter(c=>c.holder===h).forEach(c=>{if(!S.printQ.includes(c.itemId))S.printQ.push(c.itemId)});save();render()};
  }
  if(t==='data'){
    $('#conn').onclick=()=>{Y.clientId=$('#cid').value.trim()||DEFAULT_CID;Y.connected=true;saveY();doSync(false)};
    const dc=$('#disc');if(dc)dc.onclick=()=>{Y.connected=false;tok=null;saveY();setMsg('');render()};
    $('#exp').onclick=()=>dl('omnithel-items-backup-'+new Date().toISOString().slice(0,10)+'.json',{app:'omnithel-items',version:1,state:S});
    const le=$('#libexp');if(le)le.onclick=()=>idbGet('library').then(l=>dl('omnithel-items-library.json',l));
    $('#libimp').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(async tx=>{try{let o=JSON.parse(tx);if(o&&o.items&&!o.app)o={app:'omnithel-items-library',v:1,sources:o.sources||[],items:o.items};if(!o||o.app!=='omnithel-items-library'||!Array.isArray(o.items))throw 0;o.stamp=Date.now();await idbPut('library',o);useLibrary(o,'file');setMsg('library imported');if(Y.connected){try{await getToken(true);await putLibrary(o)}catch(_){}}render()}catch(_){alert("That isn't an item library file.")}})};
    $('#expc').onclick=()=>dl('omnithel-custom-items.json',{custom:S.custom,edits:S.edits});
    $('#imp').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(tx=>{try{const o=JSON.parse(tx);if(!o.state||o.app!=='omnithel-items')throw 'Not a backup from this app';if(!confirm('Replace everything in this browser with the backup?'))return;S=Object.assign(defaults(),o.state);save();buildItems();render()}catch(err){alert('Import failed: '+err)}})};
    $('#reset').onclick=()=>{if(confirm('Erase everything saved in this browser? (Export a backup first!)')&&confirm('Really erase?')){localStorage.removeItem(KEY);S=defaults();buildItems();render()}};
  }
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{S.ui.tab=b.dataset.t;save();render()});
window.addEventListener('resize',()=>{if(S.ui.tab==='print')buildPages()});
window.addEventListener('beforeprint',()=>{if(S.ui.tab!=='print'){}});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
if(Y.connected){setMsg(changed()?'● unsynced changes':'');doSync(true)}
