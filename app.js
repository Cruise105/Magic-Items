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
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){alert('Could not save to browser storage: '+e)}}
S=load();
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
  <h3>Inventory</h3>${copies.length?copies.map(c=>`<div class="copy">${esc(holderName(c.holder))}${c.attuned?' · <span class="att">attuned</span>':''}</div>`).join(''):'<p class="mu">Not in the inventory.</p>'}
  <div class="row"><select id="addto">${holderOpts('stash')}</select><button class="pri" id="addc">Add a copy</button><button id="edit">Edit</button><button id="toq">${S.printQ.includes(i.id)?'✓ In print queue':'+ Print queue'}</button>${i.id.startsWith('custom:')?'<button class="bad" id="del">Delete</button>':S.edits[i.id]?'<button id="revert">Revert to sheet</button>':''}</div></div>`;
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
  return `<p class="mu">Failed attempts are tracked per character, per copy. Moving a copy clears its attunement; a character who locked out of that copy stays locked out if it ever returns.</p><div class="cols">${col('stash','Party Stash',null)}${S.pcs.map(p=>col(p.id,p.name,p)).join('')}</div>`;
}
// ---------- print ----------
function cardHTML(i){
  const a=S.print.showAtt?attLine(i):'';
  return `<div class="pcard"><div class="n">${esc(i.name)}</div><div class="m">${esc(rarLine(i))}${a?' · '+esc(a):''}</div>${i.value||i.weight?`<div>${[i.value&&'Value: '+esc(i.value),i.weight&&'Weight: '+esc(i.weight)].filter(Boolean).join(' · ')}</div>`:''}<div class="d">${esc(i.desc)}</div></div>`;
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
  const rows=[];for(let k=0;k<cards.length;k+=2){rows.push({a:ids[k],b:ids[k+1],h:Math.max(cards[k].offsetHeight,cards[k+1]?cards[k+1].offsetHeight:0)+.12*96})}
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
  <div class="grow"></div><button class="pri" id="doprint">🖨 Print</button></div>
  <div id="pstat" class="mu" style="margin-top:6px"></div>${skipped?`<div class="warn">${skipped} GM-only twin entr${skipped>1?'ies are':'y is'} in the queue and will NOT print (they reveal curses/secrets).</div>`:''}
  <p class="mu" style="margin:4px 0 0;font-size:13px">The preview below is exactly what prints: same size, same page breaks. Cards never split across pages. Player-safe fields only — no Verdict text.</p></div>
  <div id="printout"><div class="pagewrap" id="pages"></div></div>`;
}
function dataView(){
  return `<div class="card"><h2>Backup</h2><p class="mu">This app is the master copy. Everything (inventory, fail counts, limits, edits, new items, print settings) lives in this browser, so export a backup regularly.</p>
  <div class="row"><button class="pri" id="exp">Export backup (.json)</button><label class="sm" style="margin:0">Import backup: <input type="file" id="imp" accept=".json" style="width:auto"></label></div>
  <h3>New items only</h3><div class="row"><button id="expc">Export my custom + edited items</button></div>
  <h3>Reset</h3><button class="bad" id="reset">Erase all app data in this browser</button></div>
  <div class="card"><p class="mu">${SEED.items.length} items loaded from the sheets · ${S.custom.length} custom · ${Object.keys(S.edits).length} edited</p></div>`;
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
      if(isNew){S.custom.push(Object.assign({},it,o));S.ui.sel=it.id}else if(it.id.startsWith('custom:')){Object.assign(S.custom.find(c=>c.id===it.id),o)}else S.edits[it.id]=o;
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
      $('#toq').onclick=()=>{const q=S.printQ,k=q.indexOf(sel.id);k<0?q.push(sel.id):q.splice(k,1);save();render()};
      const d=$('#del');if(d)d.onclick=()=>{if(confirm('Delete this custom item and its copies?')){S.custom=S.custom.filter(c=>c.id!==sel.id);S.inv=S.inv.filter(c=>c.itemId!==sel.id);S.printQ=S.printQ.filter(x=>x!==sel.id);S.ui.sel=null;save();buildItems();render()}};
      const r=$('#revert');if(r)r.onclick=()=>{delete S.edits[sel.id];save();buildItems();render()};
    }
  }
  if(t==='party'){
    on('[data-att]','click',e=>startAttune(e.currentTarget.dataset.att));
    on('[data-un]','click',e=>{S.inv.find(c=>c.cid===e.currentTarget.dataset.un).attuned=false;save();render()});
    on('[data-mv]','change',e=>{const c=S.inv.find(c=>c.cid===e.currentTarget.dataset.mv),to=e.target.value;if(!to)return;c.holder=to;c.attuned=false;save();render()});
    on('[data-rm]','click',e=>{if(confirm('Remove this copy (its fail counts are lost)?')){S.inv=S.inv.filter(c=>c.cid!==e.currentTarget.dataset.rm);save();render()}});
    on('[data-pq]','click',e=>{const id=e.currentTarget.dataset.pq;if(!S.printQ.includes(id))S.printQ.push(id);save();e.currentTarget.textContent='✓ queued'});
    on('[data-open]','click',e=>{e.preventDefault();S.ui.sel=e.currentTarget.dataset.open;S.ui.tab='items';render()});
    on('[data-lim]','click',e=>{const[h,d]=e.currentTarget.dataset.lim.split(':');const p=pc(h);p.limit=Math.max(0,p.limit+ +d);save();render()});
    on('[data-ren]','click',e=>{const p=pc(e.currentTarget.dataset.ren);const n=prompt('Character name',p.name);if(n&&n.trim()){p.name=n.trim();save();render()}});
  }
  if(t==='print'){
    $('#pm').onclick=()=>{S.print.pt=Math.max(MINPT,S.print.pt-.5);save();$('#ptv').textContent=S.print.pt+'pt';buildPages()};
    $('#pp').onclick=()=>{S.print.pt=Math.min(MAXPT,S.print.pt+.5);save();$('#ptv').textContent=S.print.pt+'pt';buildPages()};
    $('#paper').onchange=e=>{S.print.paper=e.target.value;save();buildPages()};
    $('#sa').onchange=e=>{S.print.showAtt=e.target.checked;save();buildPages()};
    $('#doprint').onclick=()=>window.print();
    $('#clrq').onclick=()=>{S.printQ=[];save();render()};
    on('[data-dq]','click',e=>{e.preventDefault();S.printQ=S.printQ.filter(x=>x!==e.currentTarget.dataset.dq);save();render()});
    $('#qh').onchange=e=>{const h=e.target.value;if(!h)return;S.inv.filter(c=>c.holder===h).forEach(c=>{if(!S.printQ.includes(c.itemId))S.printQ.push(c.itemId)});save();render()};
  }
  if(t==='data'){
    $('#exp').onclick=()=>dl('omnithel-items-backup-'+new Date().toISOString().slice(0,10)+'.json',{app:'omnithel-items',version:1,state:S});
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
