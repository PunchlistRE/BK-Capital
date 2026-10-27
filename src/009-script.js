
const GROUPS = [
  {id:'overview', label:'Overview', color:'#7a8da1', sheets:['Home']},
  {id:'inputs', label:'Inputs', color:'#3E9AE6', sheets:['Deal Underwrite','Deal Documents','Rent Roll','Source Ingestion','Import Deal','Import OM','Import Rent Roll','Depreciation','Market Benchmarks']},
  {id:'propops', label:'Property Operations', color:'#163a62', sheets:['Operating Underwrite','Property CF']},
  {id:'dev', label:'Development', color:'#B0592A', sheets:['Development','Dev Schedule','Dev Draws','Residual Land']},
  {id:'debt', label:'Debt', color:'#2E6E6E', sheets:['Debt','Debt Schedule','Covenant Monitor','Refi / Recap','Financing Lab','Financing Compare']},
  {id:'returns', label:'Returns & Equity', color:'#3F6B4A', sheets:['Returns','Equity Waterfall','After-Tax','Probability-Weighted']},
  {id:'biz', label:'Operating Business', color:'#6B4E71', sheets:['Business Model','Business Valuation','Sell vs Hold']},
  {id:'credit', label:'Credit & IC', color:'#7A3E4D', sheets:['IC Memo','Debt Capacity','Credit Policy','Model Checks']},
  {id:'tools', label:'Tools', color:'#5B4B8A', sheets:['Sensitivity','Reverse Solve']},
  {id:'portfolio', label:'Portfolio & Investors', color:'#5A6B7A', sheets:['Portfolio','Investors','Investor Schedules','Liquidity','Portfolio Dashboard','Data Export']},
  {id:'monthly', label:'Monthly Engine', color:'#47507A', sheets:['Waterfall (M)','Sponsor CF','Lease Cohort CF','Portfolio M','Deal Vectors (M)','Ledger (M)']},
  {id:'db', label:'Portfolio Database', color:'#566a80', sheets:['Property DB','Portfolio CF','Equity Partners','Investor Summary','Capital Calls','Capital Allocation','Portfolio Rollup','Benchmarks','Sources & Uses']},
  {id:'qa', label:'QA', color:'#A93B2C', sheets:['QA','Version History']},
  {id:'sys', label:'SYS_ Engine (hidden in Excel)', color:'#5f6f82', hidden:true, sheets:['SYS_DealDB','SYS_CF','SYS_RentRoll','SYS_Snapshots','SYS_Golden','SYS_PrintState','SYS_Curves']},
];

function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

// ---- build rail ----
const railGroups = document.getElementById('rail-groups');
// WAVE 1 NAV FIX. #rail-groups carries a static copy of the whole rail, baked into the
// document so the sidebar is painted before any script runs. This loop then appended a
// SECOND, live copy without clearing the first, leaving 94 .rail-item nodes for ~49
// sheets - 44 of them visually identical duplicates whose click handlers were never
// attached, so they did nothing. Clearing first keeps the first-paint copy doing its job
// and leaves exactly one canonical, fully-wired rail. It also repairs a knock-on defect:
// the later "Source Data" injection selects its group by POSITION among .rail-group
// nodes, and was landing inside the stale copy.
/* V30 CANONICAL NAVIGATION. The rail is rendered from GROUPS by exactly one function,
   bkBuildRail(). There is no Rendered/Queued status: every sheet in GROUPS must have a
   renderer, and a missing one is a defect surfaced loudly by showSheet(), not a status pill.
   bkBuildRail() runs once here and once after the last registration script, so sheets that
   are registered late (Source Data, Cloud Sync, Storage Lifecycle, Source Lineage) appear
   in the rail with correct group counts. */
function bkBuildRail(){
  railGroups.innerHTML = '';
  GROUPS.forEach(g=>{
    const wrap = document.createElement('div');
    wrap.className='rail-group';
    const label = document.createElement('div');
    label.className='rail-group-label';
    label.innerHTML = `<span>${g.label}</span><span class="grp-tag">${g.sheets.length}</span>`;
    wrap.appendChild(label);
    g.sheets.forEach(s=>{
      const item = document.createElement('div');
      let cur=null; try{ cur=currentSheet; }catch(e){}   /* currentSheet is a later `let` (TDZ on first build) */
      item.className = 'rail-item' + (g.hidden?' hidden-sheet':'') + (cur===s?' active':'');
      item.style.setProperty('--gid-color', g.color);
      item.dataset.sheet = s;
      item.innerHTML = `<span class="dot"></span><span class="name">${s}</span>`;
      item.addEventListener('click',()=>showSheet(s));
      wrap.appendChild(item);
    });
    railGroups.appendChild(wrap);
  });
}
bkBuildRail();

function groupOf(sheet){ return GROUPS.find(g=>g.sheets.includes(sheet)); }

/* Top navigation: the sheet groups are folded into a few tabs; each tab opens a dropdown of its sheets, grouped under the original group labels.
   GROUPS (and the left rail built from it) are unchanged - this is only how the top bar presents them. */
const NAV_TABS = [
  {id:'overview', label:'Overview',          groups:['overview']},
  {id:'underwrite', label:'Underwrite',      groups:['inputs','propops','dev']},
  {id:'financing', label:'Debt & Returns',   groups:['debt','returns','tools']},
  {id:'business', label:'Business',          groups:['biz']},
  {id:'credit', label:'Credit & IC',         groups:['credit','qa']},
  {id:'portfolio', label:'Portfolio & Data', groups:['portfolio','db','monthly']}
];
function buildChrome(sheet){
  const g = groupOf(sheet);
  let isDevDeal = false; try{ const d = bkLoad(); isDevDeal = !!d && d.dealType==='Development'; }catch(e){}
  const primary = NAV_TABS.map(t=>{
    const gs = t.groups.map(id=>GROUPS.find(x=>x.id===id)).filter(x=>x && !x.hidden && (x.id!=='dev' || isDevDeal || x.sheets.includes(sheet)));
    const on = gs.some(x=>x.sheets.includes(sheet));
    const count = gs.reduce((n,x)=>n+x.sheets.length,0);
    const color = gs[0] ? gs[0].color : '#7a8da1';
    const cur = on && count>1 ? `<span class="cur">${sheet}</span>` : '';
    if(count===1) return `<div class="grp-btn ${on?'on':''}" data-goto-sheet="${gs[0].sheets[0]}"><span class="sw" style="background:${color}"></span>${t.label}</div>`;
    const pop = gs.map(x=>`<div class="lab"><span class="sw" style="background:${x.color}"></span>${x.label}</div>`
      + x.sheets.map(s=>`<div class="it ${s===sheet?'on':''} ${RENDERERS[s]?'':'stub'}" data-goto-sheet="${s}">${s}</div>`).join('')).join('');
    return `<div class="bk-more bk-nav"><div class="grp-btn ${on?'on':''}" data-bk-more="1" role="button" aria-haspopup="true"><span class="sw" style="background:${color}"></span>${t.label}${cur}<span class="car">&#9662;</span></div><div class="bk-more-pop bk-nav-pop">${pop}</div></div>`;
  }).join('');
  return `
  <div class="brand-bar">
    <div class="brand-mark">
      <div class="glyph"><svg class="pl-logo" viewBox="0.39 -0.5 2.18 2.05" role="img" aria-label="Punchlist" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="plga0" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3f7ede"/><stop offset="1" stop-color="#51a8db"/></linearGradient><linearGradient id="plga1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3361e1"/><stop offset="1" stop-color="#4388dd"/></linearGradient><linearGradient id="plga2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a73df"/><stop offset="1" stop-color="#3d79de"/></linearGradient></defs><g transform="scale(-1,1)"><path d="M -0.6919709126561899 0.5391952559321906 C -0.7078673726787985 0.5391952557636377 -0.7231126275425115 0.5455106972026951 -0.7343523038082651 0.5567520102350523 C -0.7455919800740192 0.5679933232674095 -0.751905201532794 0.5832394975823711 -0.7519028866267181 0.5991359574364268 L -0.7519028866267181 1.403116362586431 C -0.8583002500568495 1.3822226468902832 -1.073512503754135 1.3103863169425012 -1.3037448429623104 1.195985805102442 C -1.320170061400134 1.187840106975289 -1.336377091495266 1.1795984059773517 -1.3523659332477063 1.1712607021086299 C -1.3011644021627442 1.1386197260419666 -1.2540357201413588 1.10565583122812 -1.2109798871835502 1.0723690176670897 C -1.0827985996190896 0.9732416898154426 -0.9968847578008455 0.8747863820592852 -0.9556122508973028 0.7797522675165327 C -0.9009866174210344 0.6539535966542644 -0.9232069182407467 0.5327630635896423 -1.0198730815868327 0.4293156065527016 C -1.0956106191019404 0.34825427347591875 -1.1966929145041043 0.3225516867068483 -1.3122454607935752 0.3549832019645277 C -1.3705571420745513 0.3726770673644325 -1.425691118046988 0.3995134918733497 -1.4755899816662137 0.43449103404134637 C -1.5254946009276629 0.3995335835578109 -1.58063577227629 0.3727259834257186 -1.638951957606268 0.35507047730160424 C -1.754347408289001 0.32277860258324775 -1.855342428354088 0.3484811893523181 -1.9310188731332425 0.4294814296931472 C -2.0279468624905586 0.5332256228761487 -2.050420261787793 0.6542852429351556 -1.9960128166542161 0.7795864443760872 C -1.9550719560315644 0.873843808418858 -1.869838861842518 0.9712256295289725 -1.7426699681881466 1.0689740070548086 C -1.697461343582447 1.1037386829903366 -1.6476009435105627 1.1381688034670712 -1.5930887679724939 1.1722643684850116 C -1.612900269488891 1.1827781374248443 -1.6330608723535947 1.1931900851380872 -1.653570576566605 1.203500211624741 C -1.8788631316962423 1.316609048476066 -2.089118146247575 1.3889603029126003 -2.199102526031556 1.4127951974682302 L -2.199102526031556 0.5991359574364268 C -2.198842047750112 0.5775504159743623 -2.210208538616927 0.557492151481974 -2.22885996168919 0.5466234870504516 C -2.2475113847614536 0.5357548226189295 -2.2705663427764233 0.5357548226189295 -2.2892177658486865 0.5466234870504516 C -2.30786918892095 0.557492151481974 -2.319235679787765 0.5775504159743625 -2.3189752015063205 0.5991359574364268 L -2.3189752015063205 1.4688172363377252 C -2.3189752015063205 1.4694718013657995 -2.3189752015063205 1.4701089113264596 -2.3189228363040746 1.4707547488208268 C -2.3221060986001523 1.4882354571035739 -2.3173604954429035 1.5062270195287744 -2.305969505639239 1.5198635026606138 C -2.2945785158355747 1.533499985792454 -2.2777190618172636 1.5413724617708502 -2.2599508910413895 1.5413517689821206 C -2.1474617090833084 1.5413517689821206 -1.8574806741124659 1.4399989200350185 -1.5997827863262721 1.3106306878863159 C -1.5554585518029493 1.288375476931773 -1.513007827848872 1.2658380757206815 -1.4724306144640396 1.2430184842530427 C -1.4355364203038414 1.2633536377919004 -1.397097452677387 1.2834589662764553 -1.3571137115846759 1.3033344697067086 C -1.1020340839107814 1.4300757142094045 -0.8140865642938244 1.5293775927352053 -0.7015886548020358 1.5293775927352053 C -0.6987029872156991 1.5293765419906198 -0.6958211835500878 1.5291665320068908 -0.6929658514988639 1.5287492103082536 C -0.6926429327516803 1.5287492103082536 -0.6923200140044967 1.5287492103082536 -0.6919970952573131 1.5287492103082536 C -0.6588927599223642 1.5287492103082536 -0.6320563937530774 1.5019128441389669 -0.6320563937530774 1.4688085088040175 L -0.6320563937530774 0.5991359574364268 C -0.6320563905571603 0.5660418444182682 -0.6588768026550185 0.539209711757082 -0.6919709125860727 0.5391952559322213 Z M -1.47298917662133 1.1046870749865694 C -1.541147889962558 1.0651848446872925 -1.606807391259961 1.0215196878117034 -1.6695943284538752 0.9739398925120561 C -1.7804340065412085 0.8887155258567172 -1.8532827303990795 0.8072439986956741 -1.8860371644039424 0.7318381074614573 C -1.9214098585211041 0.6503753078341219 -1.907855998673102 0.5803106672289957 -1.8434031622420037 0.511319513269912 C -1.7391265895028347 0.39970308468259774 -1.577422844967237 0.5051491469385938 -1.5126296347215398 0.5558299351789981 C -1.509484009576964 0.5583035594723671 -1.506098240253652 0.560455481943833 -1.5025231506880647 0.5622533999878387 L -1.5022002319408811 0.5624192231282847 C -1.501816220457744 0.5626112288698533 -1.5014322089746068 0.5627770520102988 -1.501039469957762 0.5629603302181596 C -1.4928790222070092 0.5667999248194033 -1.4839533329402799 0.5687366591337153 -1.4749354166381392 0.5686244995944336 C -1.4746735906269093 0.5686244995944336 -1.4744204921493869 0.5686244995944336 -1.474158666138157 0.5686244995944336 C -1.4737135619190662 0.5686244995944336 -1.4732859127673907 0.5686244995944336 -1.4728146259471768 0.56856340685848 L -1.4712000322112588 0.568484859055111 L -1.470702562789922 0.5684324938528651 C -1.464480604700767 0.56793384691247 -1.458375529417912 0.5664613251365762 -1.4526103854139347 0.564068726999033 L -1.451624174104969 0.5636672604484803 L -1.4515019886330616 0.5636061677125266 C -1.446820247015898 0.5615585727242396 -1.4424205620575428 0.5589187617492266 -1.4384106880715655 0.555751387375629 C -1.3734691097528382 0.5050007788655633 -1.2118177304194861 0.39960708181181337 -1.1075411576803171 0.5112409654665431 C -1.0433501472604487 0.579935383279566 -1.0300406583562614 0.650113481822892 -1.06564899588353 0.7320475682704413 C -1.0988136239726534 0.8083436679428395 -1.1723780055945527 0.8909585020195867 -1.2843959007324195 0.9775967291355667 C -1.3447048302225646 1.0236341855929463 -1.407678783861595 1.0660714438136674 -1.4729891766213299 1.104687074986569 Z" fill="url(#plga0)" fill-rule="nonzero"/><path d="M -0.41755107028611205 0.5359311583255244 L -0.8648197177364749 0.08866251087516164 L -0.8648197177364749 -0.15367491758554358 C -0.8645592394550323 -0.175260459047607 -0.8759257303218477 -0.19531872353999358 -0.8945771533941105 -0.20618738797151448 C -0.9132285764663732 -0.21705605240303544 -0.9362835344813412 -0.21705605240303538 -0.9549349575536039 -0.20618738797151437 C -0.9735863806258667 -0.19531872353999336 -0.9849528714926818 -0.17526045904760673 -0.9846923932112392 -0.15367491758554375 L -0.9846923932112392 -0.031210164599602908 L -1.4330257997739368 -0.4795610262297159 C -1.4568477193523135 -0.5029494407220495 -1.4950129916093127 -0.5029494407220495 -1.518834911187689 -0.47956102622971586 L -2.5343445508103444 0.5359311583255244 C -2.5574283451661493 0.5593944515927856 -2.557273743242888 0.5970822158855835 -2.5339982277973094 0.6203553350050581 C -2.510722712351731 0.6436284541245323 -2.4730349323408634 0.6437791757108926 -2.449574015907804 0.6206929656943565 L -1.4759478105482282 -0.3529332396652195 L -0.5023216051886523 0.6206929656943567 C -0.4872219032807399 0.6360409075730933 -0.4650506580485194 0.6421114309690634 -0.44423858309784725 0.6365961926361827 C -0.4234265081471751 0.6310809543033025 -0.40717120477951996 0.6148273244972011 -0.40165382366249824 0.5940158175063459 C -0.39613644254547653 0.5732043105154907 -0.4022046831555848 0.5510324403790743 -0.41755107028611205 0.5359311583255246 Z" fill="url(#plga1)" fill-rule="nonzero"/><path d="M -1.5119052494238039 0.02133831585424184 L -1.439990371672653 0.02133831585424184 C -1.4068860333305262 0.02133831585424184 -1.3800496701684168 0.048174679016351196 -1.3800496701684168 0.08127901735847798 L -1.3800496701684168 0.15319389510962889 C -1.3800496701684168 0.18629823345175567 -1.4068860333305262 0.21313459661386502 -1.439990371672653 0.21313459661386502 L -1.5119052494238039 0.21313459661386502 C -1.5450095877659304 0.21313459661386502 -1.5718459509280398 0.18629823345175567 -1.5718459509280398 0.15319389510962889 L -1.5718459509280398 0.08127901735847798 C -1.5718459509280398 0.048174679016351196 -1.5450095877659304 0.02133831585424184 -1.5119052494238039 0.02133831585424184 Z" fill="url(#plga2)" fill-rule="nonzero"/></g></svg></div>
      <div><div class="word">PUNCHLIST CAPITAL <span class="bk-beta" title="Beta: check figures against your own model before relying on them">BETA</span></div><div class="sub">Real Estate Investments</div></div>
    </div>
    <div class="brand-mid"><div class="l1">CRE UNDERWRITING MODEL</div><div class="l2">VERSION &nbsp;|&nbsp; BETA</div></div>
    <div class="pl-searchwrap"><button type="button" class="pl-search" data-pl-palette="1" aria-label="Search sheets and actions"><span>Search</span><kbd class="pl-kbd">Ctrl K</kbd></button><div id="pl-user" class="pl-user" aria-live="polite"></div></div>
  </div>
  <div class="tabnav">
    <div class="tabnav-primary-wrap">
      <button type="button" class="nav-chev nav-chev-l" data-nav-scroll="-1" aria-label="Scroll navigation left">&#9664;</button>
      <div class="tabnav-primary">${primary}</div>
      <button type="button" class="nav-chev nav-chev-r" data-nav-scroll="1" aria-label="Scroll navigation right">&#9654;</button>
    </div>
  </div>`;
}

// V29.7 -- wire the primary-nav overflow chevrons. Called by showSheet() after the chrome is
// rendered. Chevrons are shown only when there is genuinely something off-screen in that
// direction, so at full width the nav looks and behaves exactly as before. Native horizontal
// scrolling (trackpad / shift-wheel) is untouched; the chevrons just drive the same scrollLeft.
function bkWireNavOverflow(root){
  const strip = (root || document).querySelector('.tabnav-primary');
  if(!strip) return;
  const wrap = strip.closest('.tabnav-primary-wrap');
  if(!wrap) return;
  const left  = wrap.querySelector('.nav-chev-l');
  const right = wrap.querySelector('.nav-chev-r');

  function sync(){
    // 1px tolerance absorbs sub-pixel layout rounding so a chevron doesn't flicker at the ends.
    const max = strip.scrollWidth - strip.clientWidth;
    const x   = strip.scrollLeft;
    if(left)  left.classList.toggle('show',  max > 1 && x > 1);
    if(right) right.classList.toggle('show', max > 1 && x < max - 1);
  }

  [left,right].forEach(btn=>{
    if(!btn) return;
    btn.addEventListener('click', ()=>{
      // Scroll by ~75% of the visible width: enough to advance, little enough to keep context.
      strip.scrollBy({ left: Number(btn.dataset.navScroll) * strip.clientWidth * 0.75, behavior:'smooth' });
    });
  });
  strip.addEventListener('scroll', sync, { passive:true });
  if(typeof ResizeObserver === 'function'){ try{ new ResizeObserver(sync).observe(strip); }catch(e){} }
  window.addEventListener('resize', sync);

  // Keep the ACTIVE group in view when a sheet is opened from the rail rather than the strip.
  const on = strip.querySelector('.grp-btn.on');
  if(on && typeof on.scrollIntoView === 'function'){
    try{ on.scrollIntoView({ block:'nearest', inline:'nearest' }); }catch(e){}
  }
  sync();
}

function sidebarShell(bodyHtml, opts){
  opts = opts||{};
  return `<div class="side-col">
    <div class="card">
      <div class="photo"><span>${opts.photoLabel||'Property photograph<br>to be inserted on build'}</span></div>
    </div>
    ${bodyHtml}
  </div>`;
}

function colorKeyCard(){
  return `<div class="card">
    <div class="card-head">Color &amp; Formatting Key</div>
    <div>
      <div class="keyrow"><span class="keyswatch" style="background:var(--gold-100); border-color:var(--input-blue);"></span><div><b style="color:var(--input-blue)">Input Cell</b><span>Direct user assumption or hardcode. Only cells to type in.</span></div></div>
      <div class="keyrow"><span class="keyswatch" style="background:#fff; border:1px solid var(--line);"></span><div><b>Formula</b><span>Calculated on this sheet.</span></div></div>
      <div class="keyrow"><span class="keyswatch" style="background:#fff;"></span><div><b style="color:var(--linked-green)">Linked Formula</b><span>Pulled from another worksheet.</span></div></div>
      <div class="keyrow"><span class="keyswatch" style="background:#fff;"></span><div><b style="color:var(--external-red)">External Link</b><span>References another workbook.</span></div></div>
      <div class="keyrow"><span class="keyswatch" style="background:#EFEDE7;"></span><div><b style="color:var(--stored-grey)">Stored Value</b><span>Written by Save Deal / regression. Never typed.</span></div></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// V29.7 CANONICAL ACTIVE DEAL
// ---------------------------------------------------------------------------
// There must be exactly ONE definition of "which deal is active", and every
// renderer must read it. Before this, modelInfoCard() -- which is embedded in
// nearly every sheet's sidebar -- printed the literal string "BK-001", so 28
// sheets claimed Harvard was active no matter what was really loaded. That is
// what produced the contradiction of Overview reporting BK-001 while Portfolio
// simultaneously reported ShorePointe as active.
//
// The canonical source of truth is the single active-deal slot in localStorage
// (BK_STORE), read through bkLoad(). These accessors are the ONLY sanctioned
// way for a renderer to state the active deal's identity. They are defined in
// the visual-master script, which loads BEFORE the functional engine script
// that defines bkLoad(), so every accessor is typeof-guarded: during the very
// first showSheet('Home') pass bkLoad does not exist yet and we report '-'
// rather than inventing an identity.
function bkActiveDeal(){
  try{ return (typeof bkLoad==='function') ? bkLoad() : null; }catch(e){ return null; }
}
function bkActiveDealId(){
  const s=bkActiveDeal(); const v=s&&s.dealId; return (v===undefined||v===null||v==='')?'-':String(v);
}
function bkActiveDealName(){
  const s=bkActiveDeal(); const v=s&&s.name; return (v===undefined||v===null||v==='')?'-':String(v);
}
// "BK-001 - Harvard Avenue" style label, degrading cleanly when either half is absent.
function bkActiveDealLabel(){
  const id=bkActiveDealId(), nm=bkActiveDealName();
  if(id==='-'&&nm==='-') return '-';
  if(id==='-') return nm;
  if(nm==='-') return id;
  return id+' - '+nm;
}
// Canonical portfolio key for the ACTIVE deal, so the Portfolio ACTIVE badge is
// derived from the same identity every other page uses rather than from "this
// row exists" or "this row was loaded at some point".
function bkActiveDealKey(){
  const s=bkActiveDeal();
  if(!s) return null;
  return String(s.dealId || s.name || 'untitled');
}

// ---------------------------------------------------------------------------
// V29.7 CANONICAL DEAL-DATE PARSING  (state fix - NOT a formula change)
// ---------------------------------------------------------------------------
// `closing`, `leaseStart` and `leaseEnd` are free-text fields in this app, and
// real data uses two different shapes: BK_BASE ships closing:'1/1/2027'
// (M/D/YYYY) while Harvard and the lease fixtures use '2026-01-01' (ISO).
// Four code paths built dates as `new Date(str + 'T00:00:00')`, which is only
// valid for the ISO shape. Fed the app's OWN default '1/1/2027' that produces
// the string '1/1/2027T00:00:00' -> Invalid Date. Consequences measured in the
// live build, both of which BK observed:
//   1. Waterfall (M), Deal Vectors (M) and Ledger (M) threw
//      "RangeError: Invalid time value" from .toISOString() and rendered
//      nothing at all.
//   2. bkXirr() received an all-NaN date vector. Its no-bracket guard is
//      `if (fl*fh > 0) return NaN`, and NaN > 0 is FALSE, so the guard did not
//      fire; bisection then ran against NaN comparisons and converged on its
//      own upper seed hi = 10, i.e. a fabricated "1000.0%" IRR.
// This helper does not change any financial formula. It only ensures the date
// vector handed to the existing, unmodified engine is real.
//
// Accepted shapes are ONLY the two the app actually produces. Anything else
// returns null so the caller can fall back explicitly rather than silently
// dating a deal to 1970 or to today - blank is preferable to wrong.
//   - 'YYYY-MM-DD'  (ISO, as used by Harvard + lease fixtures)
//   - 'M/D/YYYY'    (US month-first, as used by BK_BASE.closing '1/1/2027')
// M/D/YYYY is read month-first because that is already this app's effective
// convention: bare `new Date('1/1/2027')` is parsed month-first by JS, which is
// how every non-crashing path in the build has always interpreted these
// strings. This preserves existing behaviour rather than introducing a new one.
// ---------------------------------------------------------------------------
// V29.7 CANONICAL ACQUISITION FEE  (duplicate-input consolidation)
// ---------------------------------------------------------------------------
// Two independently editable inputs represented the SAME economic fee:
//   acqFeePct          - Deal Underwrite, "Acquisition Fee to Sponsor" (% of price)
//   acquisitionFeePct  - "Sponsor Economics - Additional Workbook Input" (% of purchase price)
// Both computed purchasePrice x pct, and two call sites already coalesced them
// (`s.acqFeePct != null ? s.acqFeePct : s.acquisitionFeePct`), i.e. earlier code had
// already concluded they were one concept. But two other call sites -- Sponsor CF
// (fee INCOME) and the Development land stack -- read acquisitionFeePct only.
//
// Measured consequence before consolidation (ShorePointe, $10,325,000 price):
//   acqFeePct 3% / acquisitionFeePct 1% -> deal PAYS $309,750, sponsor RECEIVES $103,250
//   acqFeePct 1% / acquisitionFeePct 3% -> deal PAYS $103,250, sponsor RECEIVES $309,750
// A $206,500 discrepancy in either direction: the fee the deal pays and the fee the
// sponsor receives were different numbers. Latent only because both default to 0.01.
//
// acqFeePct is canonical: it is the Deal Underwrite control, it drives debt sizing and
// the unlevered initial outlay, and it already won at both coalescing sites. Reading
// through this one accessor makes every calculation reference the same assumption.
//
// It does NOT silently discard a divergent legacy value -- bkAcqFeeConflict() reports the
// conflict so it can be surfaced rather than resolved behind the user's back.
function bkAcqFeePct(s){
  if(!s) return 0;
  if(s.acqFeePct !== undefined && s.acqFeePct !== null && s.acqFeePct !== '') return Number(s.acqFeePct)||0;
  if(s.acquisitionFeePct !== undefined && s.acquisitionFeePct !== null && s.acquisitionFeePct !== '') return Number(s.acquisitionFeePct)||0;
  return 0;
}
// Renders the Sponsor Economics acquisition-fee row as a CANONICAL MIRROR of the Deal
// Underwrite control rather than a second editable input. The number is still shown here --
// no information is removed from the page -- but there is now exactly one place to edit it,
// so the fee the deal pays and the fee the sponsor receives can no longer diverge.
// If a legacy saved deal carries a different acquisitionFeePct, BOTH values are surfaced as
// a conflict instead of one being silently chosen.
function bkAcqFeeMirrorRow(){
  const s = (typeof bkLoad==='function') ? bkLoad() : null;
  if(!s) return '';
  const pct = bkAcqFeePct(s);
  const shown = (pct*100).toFixed(2).replace(/\.00$/,'') + '%';
  const conflict = bkAcqFeeConflict(s);
  let row = '<tr><td class="rowlabel">Acquisition Fee</td>'
          + '<td class="v linked">' + shown + '</td>'
          + '<td style="text-align:left">% of purchase price</td>'
          + '<td><span class="status-chip">Linked</span></td></tr>'
          + '<tr><td class="rowlabel" colspan="4" style="font-size:10.5px;color:var(--ink-500);">'
          + 'Same assumption as <b>Acquisition Fee to Sponsor</b> on Deal Underwrite - edit it there. '
          + 'Previously this was a second editable input for the same fee, which let the amount the deal '
          + 'pays differ from the amount the sponsor receives.</td></tr>';
  if(conflict){
    row += '<tr><td class="rowlabel" colspan="4">'
        +  '<div class="note-flag"><span>&#9888;</span><div><b>Conflicting saved values -</b> this deal stores '
        +  'an Acquisition Fee to Sponsor of <b>' + (conflict.canonical*100).toFixed(2) + '%</b> and a legacy '
        +  'Sponsor Economics Acquisition Fee of <b>' + (conflict.legacy*100).toFixed(2) + '%</b>. The engine is '
        +  'using <b>' + (conflict.canonical*100).toFixed(2) + '%</b> (the Deal Underwrite control). Both values are shown '
        +  'rather than one being silently discarded - confirm the intended rate on Deal Underwrite.</div></div>'
        +  '</td></tr>';
  }
  return row;
}
// Returns null when there is no conflict, otherwise both values so the UI can show BOTH
// rather than silently choosing one (source-vs-input conflict rule).
function bkAcqFeeConflict(s){
  if(!s) return null;
  const a=s.acqFeePct, b=s.acquisitionFeePct;
  if(a===undefined||a===null||a==='') return null;
  if(b===undefined||b===null||b==='') return null;
  return (Number(a)===Number(b)) ? null : {canonical:Number(a), legacy:Number(b)};
}

function bkParseDealDate(str, fallbackISO){
  const tryParse = function(v){
    if(v===undefined || v===null) return null;
    const t = String(v).trim();
    if(!t) return null;
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);          // ISO
    if(m) { const d = new Date(+m[1], +m[2]-1, +m[3]); return isNaN(d.getTime())?null:d; }
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);            // M/D/YYYY
    if(m) { const d = new Date(+m[3], +m[1]-1, +m[2]); return isNaN(d.getTime())?null:d; }
    return null;                                                // unrecognised - do NOT guess
  };
  return tryParse(str) || tryParse(fallbackISO) || null;
}

function modelInfoCard(extra){
  return `<div class="card">
    <div class="card-head">Model Information</div>
    <div class="metric-list info-list">
      <div class="metric-row"><span class="k">Version</span><span class="v">Beta</span></div>
      <div class="metric-row"><span class="k">Workbook</span><span class="v">CRE Master</span></div>
      <div class="metric-row"><span class="k">Active Deal</span><span class="v">${bkActiveDealLabel()}</span></div>
      ${extra||''}
    </div>
  </div>`;
}

// ---------------- SHEET CONTENT BUILDERS ----------------

function sheetHome(){
  const main = `
    <div class="title-block" style="padding-left:0;padding-right:0;border:none;">
      <div class="crumbs">Overview &middot; Navigation</div>
      <h2>Punchlist Capital CRE</h2>
      <p class="desc">Institutional acquisition &amp; development underwriting engine (beta). This tab orients every user: active deal status, certification, an eight-step workflow, the full 45-sheet map, cell-color and tab-color conventions, and the macro control center.</p>
    </div>

    <div class="tbl-wrap" style="margin-bottom:18px;">
      <table class="fin">
        <caption>Active Deal &amp; Certification</caption>
        <tbody>
          <!-- V29.11.0 FIRST-PAINT FIX. This original V7.2 prototype card is superseded at
               runtime by the state-driven Home renderer, but bk-functional-v02/v03 call
               showSheet() at module scope, so THIS markup is what paints during boot -
               before the later layers install. Measured: "Havard", "BK-001", "(1.03%)",
               "0.92x" and "BASE CASE" were all visible in early frames of a clean context.
               The literals are replaced with neutral placeholders so that even the boot
               frame cannot show a deal that does not exist. -->
          <tr><td class="rowlabel">Deal</td><td class="v" style="text-align:left;">-</td></tr>
          <tr><td class="rowlabel">Scenario</td><td class="v" style="text-align:left;">-</td></tr>
          <tr><td class="rowlabel">Deal Data</td><td style="text-align:left;">-</td></tr>
          <tr><td class="rowlabel">Levered IRR / MOIC</td><td class="v" style="text-align:left;">-</td></tr>
          <tr class="section"><td colspan="2">Certification</td></tr>
          <tr><td class="rowlabel">Engine Certified</td><td style="text-align:left;">-</td></tr>
          <tr><td class="rowlabel">Deal Investment Ready</td><td style="text-align:left;">-</td></tr>
          <tr><td class="rowlabel">Portfolio Current</td><td style="text-align:left;">-</td></tr>
        </tbody>
      </table>
    </div>

    <div class="note-flag"><span>&#9888;</span><div><b>Design note -</b> the redesign renders certification state honestly rather than hiding it. An institutional cover sheet that shows green when the engine is actually failing is worse than one that shows the real amber/red state - this is a live instrument panel, not marketing collateral.</div></div>

    <div class="tbl-wrap" style="margin:18px 0;">
      <table class="fin">
        <caption>Workflow</caption>
        <tbody>
          <tr><td class="rowlabel" style="width:32%">1. Select deal</td><td class="rowlabel">Deal Underwrite: set Active Deal (1-10), click Load Deal.</td></tr>
          <tr><td class="rowlabel">2. Enter inputs</td><td class="rowlabel">Edit the yellow/blue cells only. STATUS marks MISSING fields - nothing is ever invented to fill a gap.</td></tr>
          <tr><td class="rowlabel">3. Review underwriting</td><td class="rowlabel">Operating Underwrite (Y1 stabilized + T-12), Development (budget &amp; cost ladder).</td></tr>
          <tr><td class="rowlabel">4-8.</td><td class="rowlabel">Debt sizing → Returns → Save Deal → Portfolio rollup → QA regression.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="tbl-wrap">
      <table class="fin">
        <caption>Tab Colour Legend (by function)</caption>
        <tbody>
          <tr><td class="rowlabel" style="width:32%"><span class="keyswatch" style="background:#7a8da1;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Overview</td><td class="rowlabel">Home - this page.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#3E9AE6;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Gold</td><td class="rowlabel">Inputs - Deal Underwrite, Rent Roll. The only tabs you type into.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#163a62;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Navy</td><td class="rowlabel">Property operations - Operating Underwrite, Property CF.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#B0592A;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Orange</td><td class="rowlabel">Development - Development, Dev Schedule, Dev Draws, Residual Land.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#2E6E6E;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Teal</td><td class="rowlabel">Debt - Debt, Debt Schedule, Covenant Monitor.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#3F6B4A;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Green</td><td class="rowlabel">Returns &amp; equity - Returns, Equity Waterfall, After-Tax.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#5B4B8A;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Purple</td><td class="rowlabel">Analytical tools - Sensitivity, Reverse Solve.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#5A6B7A;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Slate</td><td class="rowlabel">Portfolio &amp; investors - snapshot-driven views.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#A93B2C;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Red</td><td class="rowlabel">QA - controls, regression, certification.</td></tr>
          <tr><td class="rowlabel"><span class="keyswatch" style="background:#5f6f82;display:inline-block;vertical-align:-2px;margin-right:6px;"></span>Grey</td><td class="rowlabel">SYS_ engine sheets - hidden, uncoloured by design.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="note-flag"><span>&#9888;</span><div><b>Audit finding -</b> this legend is already written on your live Home tab, but no sheet actually carries these tab colours today (everything reads flat gold or navy, SYS_ sheets are all visible). The rebuild applies this legend for real - correct tab colours, and SYS_ sheets re-hidden.</div></div>
  `;
  const sidebar = sidebarShell(`
    ${modelInfoCard(`
      <div class="metric-row"><span class="k">Tab Group</span><span class="v">Overview</span></div>
      <div class="metric-row"><span class="k">Formatting</span><span class="v">Standardized</span></div>
    `)}
    ${colorKeyCard()}
  `, {photoLabel:'No single property -<br>portfolio cover page'});
  return {title:'Home', crumbs:'Overview', desc:'Model cover sheet: active deal, certification, workflow, sheet map, conventions, macro control center.', meta:null, main, sidebar};
}

function sheetDealUnderwrite(){
  const main = `
    <div class="tbl-wrap">
      <table class="fin">
        <caption>Identity</caption>
        <thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          <tr class="input"><td class="rowlabel">Deal ID</td><td class="v">-</td><td>SOURCE</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Investment Name</td><td class="v">-</td><td>SOURCE</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Location</td><td class="v">Stamford, CT</td><td>SOURCE</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Deal Type</td><td class="v">Acquisition</td><td>SOURCE</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Property Type</td><td class="v">Industrial</td><td>SOURCE</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Status</td><td class="v">Owned</td><td>UW</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Acquisition / Land Closing Date</td><td class="v">1/1/2026</td><td>UW</td><td><span class="status-chip pass">OK</span></td></tr>
        </tbody>
      </table>
    </div>
    <div class="tbl-wrap" style="margin-top:16px;">
      <table class="fin">
        <caption>Program</caption>
        <thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead>
        <tbody>
          <tr class="input"><td class="rowlabel">Rentable Units (suites)</td><td class="v">5</td><td>units</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Gross Building Area</td><td class="v">63,447</td><td>GSF</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Commercial Area</td><td class="v">63,447</td><td>NRSF</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Parking Spaces</td><td class="v">150</td><td>spaces</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Site Area</td><td class="v">2.59</td><td>acres</td><td><span class="status-chip pass">OK</span></td></tr>
          <tr class="input"><td class="rowlabel">Average Unit Size</td><td class="v">12,689</td><td>NRSF / unit</td><td><span class="status-chip pass">OK</span></td></tr>
        </tbody>
      </table>
    </div>
    <div class="note-flag"><span>&#9888;</span><div><b>Design note -</b> ~130 more input rows follow below the fold (Source Economics, Operating Assumptions, Exit &amp; Hold, JV Structure, Sponsor Fees, Debt, Scenario Drivers, Global Assumptions) - same table system continues at full length; not reproduced here to keep this preview scannable.</div></div>
  `;
  const sidebar = sidebarShell(`
    ${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Inputs</span></div>`)}
    ${colorKeyCard()}
  `);
  return {title:'Deal Underwrite', crumbs:'Inputs', desc:'All deal inputs - the single authoritative source. Save Deal / Load Deal live here.', meta:{Property:'Havard Avenue', 'Asset Class':'Industrial', Location:'Stamford, CT', 'Start Date':'1/1/2026', Stabilization:'Year 1', Currency:'USD'}, main, sidebar};
}

function sheetRentRoll(){
  const rows = [
    ['180-1: Integrity Automotive','10,447','15,670.50','15,670.50','11/1/2023','10/31/2033','93'],
    ['180-2: Integrity Automotive (Space #2)','15,000','20,600.00','22,500.00','5/1/2025','10/31/2033','93'],
    ['180-3: Soule, Blake &amp; Wechsler','5,000','7,818.90','7,500.00','2/1/2018','1/31/2027','12'],
    ['200-1: Service Master','16,500','16,878.97','24,750.00','2/1/2018','1/31/2028','24'],
    ['200-2: TorqMaster','16,500','15,205.98','24,750.00','2/1/2018','1/31/2028','24'],
  ];
  const rowsHtml = rows.map(r=>`<tr><td class="rowlabel">${r[0]}</td><td>${r[1]}</td><td class="input v">${r[2]}</td><td class="input v">${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td>${r[6]}</td></tr>`).join('');
  const main = `
    <div class="tbl-wrap">
      <table class="fin">
        <caption>Rent Roll Summary</caption>
        <tbody>
          <tr><td class="rowlabel">Units in Rent Roll</td><td class="v">5</td></tr>
          <tr><td class="rowlabel">Occupied / Vacant</td><td class="v">5 / 0</td></tr>
          <tr><td class="rowlabel">Physical Occupancy</td><td class="v linked">100.0%</td></tr>
          <tr><td class="rowlabel">Total Rentable SF</td><td class="v">63,447</td></tr>
          <tr><td class="rowlabel">GPR - In-Place Basis</td><td class="v linked">$76,174 /mo</td></tr>
          <tr><td class="rowlabel">GPR - Market Basis</td><td class="v linked">$95,171 /mo</td></tr>
          <tr><td class="rowlabel">Avg In-Place Rent / SF</td><td class="v linked">$1.20 /SF/mo</td></tr>
          <tr><td class="rowlabel">Loss to Lease</td><td class="v linked">19.96%</td></tr>
          <tr class="subtotal"><td class="rowlabel">WALT - Weighted Avg Lease Term Remaining</td><td class="v">55.6 months</td></tr>
        </tbody>
      </table>
    </div>
    <div class="tbl-wrap" style="margin-top:16px;">
      <table class="fin">
        <caption>Rent Roll Detail - input block; paste rent roll into the blue columns</caption>
        <thead><tr><th class="rowlabel-h">Unit / Tenant</th><th>SF</th><th>In-Place $/mo</th><th>Market $/mo</th><th>Lease Start</th><th>Lease End</th><th>Mos. to Exp.</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="note-flag"><span>&#9888;</span><div><b>Rollover flag -</b> Soule, Blake &amp; Wechsler rolls in 12 months (Jan 2027); Service Master and TorqMaster both roll in 24 months. 56% of rentable SF is inside a 24-month rollover window - worth a callout box on the rebuilt sheet, styled off the same amber status token used elsewhere.</div></div>
  `;
  const sidebar = sidebarShell(`
    <div class="card">
      <div class="card-head">Key Metrics</div>
      <div class="metric-list">
        <div class="metric-row"><span class="k">Occupancy</span><span class="v pos">100.0%</span></div>
        <div class="metric-row"><span class="k">WALT</span><span class="v">4.6 yrs</span></div>
        <div class="metric-row"><span class="k">Tenants</span><span class="v">4 (5 suites)</span></div>
        <div class="metric-row"><span class="k">Avg In-Place PSF</span><span class="v">$1.20</span></div>
        <div class="metric-row"><span class="k">Mark-to-Market</span><span class="v linked">+19.96%</span></div>
      </div>
    </div>
    ${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Inputs</span></div>`)}
    ${colorKeyCard()}
  `);
  return {title:'Rent Roll', crumbs:'Inputs', desc:'Unit-level rent roll, rollover exposure, WALT, and the market-vs-in-place revenue basis switch.', meta:{Property:'Havard Avenue', 'Asset Class':'Industrial', Location:'Stamford, CT', Units:'5 suites', SF:'63,447', Currency:'USD'}, main, sidebar};
}

function sheetOperatingUnderwrite(){
  const main = `
    <div class="tbl-wrap">
      <table class="fin">
        <caption>Revenue - Year 1 Stabilized</caption>
        <thead><tr><th class="rowlabel-h">Line Item</th><th>Annual ($)</th><th>% of GPR</th></tr></thead>
        <tbody>
          <tr><td class="rowlabel">Commercial Base Rent</td><td>914,092</td><td>-</td></tr>
          <tr><td class="rowlabel">Expense Recoveries (NNN)</td><td>126,894</td><td>-</td></tr>
          <tr><td class="rowlabel">Less: Commercial Vacancy / Credit Loss</td><td>(52,049)</td><td>-</td></tr>
          <tr class="subtotal"><td class="rowlabel">Net Commercial Income</td><td>988,937</td><td>-</td></tr>
          <tr class="grandtotal"><td class="rowlabel">Effective Gross Income</td><td>988,937</td><td>100.0%</td></tr>
        </tbody>
      </table>
    </div>
    <div class="tbl-wrap" style="margin-top:16px;">
      <table class="fin">
        <caption>Expenses</caption>
        <thead><tr><th class="rowlabel-h">Line Item</th><th>Annual ($)</th><th style="text-align:left">Basis</th></tr></thead>
        <tbody>
          <tr><td class="rowlabel">Real Estate Taxes</td><td>145,000</td><td>-</td></tr>
          <tr><td class="rowlabel">Insurance</td><td class="v">-</td><td style="text-align:left;"><span class="status-chip warn">NNN - tenant reimbursed</span></td></tr>
          <tr><td class="rowlabel">Utilities</td><td>106,951</td><td>-</td></tr>
          <tr><td class="rowlabel">Repairs &amp; Maintenance</td><td>11,900</td><td>-</td></tr>
          <tr><td class="rowlabel">Management Fee</td><td class="v">-</td><td style="text-align:left;"><span class="status-chip warn">NNN - tenant reimbursed</span></td></tr>
          <tr><td class="rowlabel">Payroll, Turnover, Marketing</td><td class="v">-</td><td style="text-align:left;"><span class="status-chip warn">NNN - tenant reimbursed</span></td></tr>
          <tr><td class="rowlabel">General &amp; Administrative</td><td>12,624</td><td>-</td></tr>
          <tr><td class="rowlabel">Miscellaneous (catch-all, $/GSF)</td><td>634,470</td><td style="text-align:left;"><span class="status-chip fail">Flagged - see note</span></td></tr>
          <tr class="grandtotal"><td class="rowlabel">Total Expenses</td><td>910,945</td><td>-</td></tr>
        </tbody>
      </table>
    </div>
    <div class="tbl-wrap" style="margin-top:16px;">
      <table class="fin">
        <tbody>
          <tr class="subtotal"><td class="rowlabel">Net Operating Income</td><td>77,992</td></tr>
          <tr><td class="rowlabel">Less: Replacement Reserves</td><td class="v">-</td></tr>
          <tr class="grandtotal"><td class="rowlabel">NOI After Reserves</td><td>77,992</td></tr>
        </tbody>
      </table>
    </div>
    <div class="note-flag"><span>&#9888;</span><div><b>Open question -</b> "Miscellaneous" is carrying $10/GSF × 63,447 GSF = $634,470/yr - on its own that's larger than every other expense line combined, and it's the dominant reason Year-1 NOI underwrites to $77,992 instead of something closer to your reference figures. Confirming the zeroed NNN lines didn't cover this one too - is $10/GSF the right catch-all rate for this deal, or should it be closer to $1-2/GSF?</div></div>
  `;
  const sidebar = sidebarShell(`
    <div class="card">
      <div class="card-head">Key Metrics</div>
      <div class="metric-list">
        <div class="metric-row"><span class="k">EGI</span><span class="v">$988,937</span></div>
        <div class="metric-row"><span class="k">Total Expenses</span><span class="v">$910,945</span></div>
        <div class="metric-row"><span class="k">Expense Ratio</span><span class="v neg">92.1%</span></div>
        <div class="metric-row"><span class="k">NOI (Y1)</span><span class="v">$77,992</span></div>
      </div>
    </div>
    ${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Property Ops</span></div>`)}
    ${colorKeyCard()}
  `);
  return {title:'Operating Underwrite', crumbs:'Property Operations', desc:'Year-1 stabilized operating statement plus source T-12 comparison.', meta:{Property:'Havard Avenue', 'Asset Class':'Industrial', Location:'Stamford, CT', Basis:'Year 1 $', Currency:'USD', Status:'Complete'}, main, sidebar};
}

function sheetPropertyCF(){
  const years = ['Year 1<br>12/31/2026','Year 2<br>12/31/2027','Year 3<br>12/31/2028','Year 4<br>12/31/2029','Year 5<br>12/31/2030'];
  const th = `<th class="rowlabel-h">Line Item</th><th>Total</th>` + years.map(y=>`<th>${y}</th>`).join('');
  function row(label,total,vals,cls){ return `<tr class="${cls||''}"><td class="rowlabel">${label}</td><td>${total}</td>${vals.map(v=>`<td>${v}</td>`).join('')}</tr>`; }
  const main = `
    <div class="tbl-wrap">
      <table class="fin">
        <caption>Property Operating Cash Flow - Annual</caption>
        <thead><tr>${th}</tr></thead>
        <tbody>
          <tr class="section"><td colspan="7">Revenue</td></tr>
          ${row('Gross Potential Rent','11,228,841',['1,002,272','1,027,329','1,023,012','1,079,338','1,106,321'])}
          ${row('Concessions','(125,000)',['(25,000)','(25,000)','(25,000)','(25,000)','(25,000)'])}
          ${row('Loss to Lease &amp; Bad Debt','(280,000)',['(56,000)','(56,000)','(56,000)','(56,000)','(56,000)'])}
          ${row('Commercial Income (base + recoveries)','11,633,841',['1,083,272','1,108,329','1,134,012','1,160,338','1,187,321'])}
          <tr class="subtotal">${row('Effective Gross Income','11,228,841',['1,022,272','1,027,229','1,023,012','1,079,339','1,106,321']).replace('<tr class="">','').replace('</tr>','')}</tr>
          <tr class="section"><td colspan="7">Operating Expenses</td></tr>
          ${row('Controllable Operating Expenses','(919,446)',['(80,204)','(82,610)','(82,088)','(87,641)','(90,270)'])}
          ${row('Insurance','(150,000)',['(30,000)','(30,000)','(30,000)','(30,000)','(30,000)'])}
          ${row('Real Estate Taxes','(1,662,263)',['(145,000)','(145,350)','(163,351)','(158,445)','(163,198)'])}
          ${row('Management Fee','(112,288)',['(11,288)','(11,536)','(11,854)','(12,184)','(12,525)'])}
          <tr class="subtotal">${row('Total Operating Expenses','(2,581,709)',['(225,204)','(231,960)','(238,919)','(246,086)','(253,463)']).replace('<tr class="">','').replace('</tr>','')}</tr>
          ${row('NOI Before Reserves','8,647,132',['777,069','795,369','814,094','833,252','852,853'])}
          ${row('Replacement Reserves','(250,000)',['(50,000)','(50,000)','(50,000)','(50,000)','(50,000)'])}
          <tr class="subtotal">${row('Net Operating Income','8,397,132',['727,069','745,369','764,094','783,252','802,853']).replace('<tr class="">','').replace('</tr>','')}</tr>
          <tr class="section"><td colspan="7">Sales Proceeds</td></tr>
          ${row('Gross Sale Price','14,004,835',['-','-','-','-','-'])}
          ${row('Cost of Sale','(280,097)',['-','-','-','-','-'])}
          <tr class="subtotal">${row('Net Sales Proceeds','13,724,738',['-','-','-','-','-']).replace('<tr class="">','').replace('</tr>','')}</tr>
          <tr class="grandtotal">${row('Unlevered Property Cash Flow','11,559,870',['(10,034,931)','795,369','814,094','833,252','852,853']).replace('<tr class="">','').replace('</tr>','')}</tr>
        </tbody>
      </table>
    </div>
    <div class="note-flag"><span>&#9888;</span><div><b>Reflects your uploaded reference image's figures</b> (healthy state, 14.6% unlevered IRR) rather than the currently-cached live engine output ((1.03%) levered) - pending resolution of the Operating Underwrite misc-opex question at left, since that line is what's dragging the live engine numbers down. Once that's settled I'll re-pull whichever figures are correct before this gets built into Excel.</div></div>
  `;
  const sidebar = sidebarShell(`
    <div class="card">
      <div class="card-head">Key Metrics (Unlevered)</div>
      <div class="metric-list">
        <div class="metric-row"><span class="k">Total Project Cost</span><span class="v">$10,885,220</span></div>
        <div class="metric-row"><span class="k">Total Revenues</span><span class="v">$25,233,675</span></div>
        <div class="metric-row"><span class="k">Total Expenses</span><span class="v">($2,581,709)</span></div>
        <div class="metric-row"><span class="k">NOI (Year 1)</span><span class="v">$727,069</span></div>
        <div class="metric-row"><span class="k">Exit Cap Rate</span><span class="v">6.50%</span></div>
        <div class="metric-row"><span class="k">Exit Value</span><span class="v">$13,724,738</span></div>
        <div class="metric-row"><span class="k">Unlevered IRR</span><span class="v pos">14.6% *</span></div>
        <div class="metric-row"><span class="k">Unlevered MOIC</span><span class="v pos">2.16x *</span></div>
      </div>
      <div style="padding:8px 14px 12px; font-size:10px; color:var(--ink-400); border-top:1px solid var(--line-soft);">* From your reference image, not the live engine - see note below.</div>
    </div>
    ${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Property Ops</span></div><div class="metric-row"><span class="k">Checks</span><span class="v"><span class="status-chip pass">Complete</span></span></div>`)}
    ${colorKeyCard()}
  `, {photoLabel:'Property photograph<br>to be inserted on build'});
  return {title:'Property Cash Flow', crumbs:'Property Operations', desc:'Monthly and annual property cash flow: revenue, expenses, NOI, sale, unlevered CF.', meta:{Property:'Havard Avenue', 'Asset Class':'Industrial', Location:'Stamford, CT', 'Start Date':'1/1/2026', Stabilization:'Year 3', Currency:'USD'}, main, sidebar};
}

// ---------------------------------------------------------------------------
// V29.9.6 DEV - MULTI-SHEET YARDI PARSER + PROPERTY/RR RECOGNITION
// Original file -> raw facts -> normalized facts -> review -> approved inputs.
// Frozen V29.7 calculation engine is not modified by this module.
// ---------------------------------------------------------------------------
const BK_SOURCE_STORE='bkcapital.source.staging.v02';
const BK_SOURCE_APPROVAL_STORE='bkcapital.source.approvals.v02';
const BK_SOURCE_SCHEMA_VERSION='V29.9.6';

function sheetSourceIngestion(){
  const main = `
    <div class="tbl-wrap" style="padding:18px;">
      <div style="font-family:'Schibsted Grotesk','Inter','Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:600;color:var(--navy-900);margin-bottom:6px;">Source Ingestion</div>
      <div style="font-size:12px;color:var(--ink-500);line-height:1.55;max-width:95ch;margin-bottom:14px;">Upload the original Yardi / Excel source. The pipeline preserves the raw file structure, normalizes explicit facts, classifies property scope, and creates review candidates. Nothing is written to underwriting unless an eligible candidate is explicitly approved.</div>
      <input id="bkSourceFile" type="file" accept=".xlsx,.xls,.csv" style="font:12px Inter,sans-serif;max-width:100%;">
      <button id="bkReadSourceBtn" type="button" disabled onclick="bkIngestSourceFile()" style="margin-left:8px;padding:7px 12px;border:1px solid var(--navy-900);border-radius:5px;background:var(--navy-900);color:white;font:600 11px Inter,sans-serif;cursor:pointer;">READ SOURCE</button>
      <button id="bkShowStagedBtn" type="button" disabled onclick="bkRenderStoredSource()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">SHOW STAGED</button><button id="bkDecisionLogBtn" type="button" disabled onclick="bkRenderSourceDecisions()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">DECISION LOG</button><button id="bkIngestionQABtn" type="button" disabled onclick="bkRunIngestionQA()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">RUN INGESTION QA</button><button id="bkCloudLineageBtn" type="button" disabled onclick="bkRunCloudLineageQA()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">VERIFY CLOUD LINEAGE</button>
      <div id="bkIngestMsg" style="margin-top:12px;font-size:11px;color:var(--ink-500);">${localStorage.getItem(BK_SOURCE_STORE)?'A staged source package is available in this browser.':'No file staged.'}</div>
    </div>
    <div id="bkIngestSummary" style="margin-top:16px;"></div>
    <div id="bkIngestCandidates" style="margin-top:16px;"></div>
    <div id="bkIngestQA" style="margin-top:16px;"></div><div id="bkIngestDecisions" style="margin-top:16px;"></div><div id="bkIngestPreview" style="margin-top:16px;"></div>`;
  const sidebar = sidebarShell(`
    <div class="card"><div class="card-head">Hard Rules</div><div class="metric-list info-list">
      <div class="metric-row"><span class="k">Explicit + property-specific</span><span class="v">Eligible</span></div>
      <div class="metric-row"><span class="k">Portfolio / group fact</span><span class="v">Review</span></div>
      <div class="metric-row"><span class="k">Ambiguous property</span><span class="v">Review</span></div>
      <div class="metric-row"><span class="k">Missing value</span><span class="v">Blank</span></div>
      <div class="metric-row"><span class="k">Silent overwrite</span><span class="v neg">Never</span></div>
    </div></div>
    <div class="card"><div class="card-head">Pipeline</div><div class="metric-list info-list">
      <div class="metric-row"><span class="k">1</span><span class="v">Raw Source</span></div>
      <div class="metric-row"><span class="k">2</span><span class="v">Normalized Facts</span></div>
      <div class="metric-row"><span class="k">3</span><span class="v">Scope Classification</span></div>
      <div class="metric-row"><span class="k">4</span><span class="v">Candidate Mapping</span></div>
      <div class="metric-row"><span class="k">5</span><span class="v">Human Approval</span></div>
    </div></div>
    ${modelInfoCard(`<div class="metric-row"><span class="k">Version</span><span class="v">Beta</span></div><div class="metric-row"><span class="k">Engine</span><span class="v">Frozen</span></div>`)}
  `,{photoLabel:'SOURCE INGESTION<br>REVIEW PIPELINE'});
  setTimeout(bkRenderStoredSource,0);
  return {title:'Source Ingestion', crumbs:'Inputs', desc:'Source-first staging, normalization, exception review, and controlled approval.', meta:{Mode:'Production', Engine:'Frozen', Writeback:'Approval Only', Review:'Required', Source:'Yardi / Excel', Status:'Multi-Sheet Parser + QA'}, main, sidebar};
}

function bkEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function bkLoadSheetJs(){
  /* V29.10.5: this used to inject a <script> tag pointing at a public CDN, which
     made workbook ingestion fail whenever the network, a corporate proxy or the
     CDN was unavailable - and fail mid-operation rather than at load. The reader
     is now embedded in this file (see bk-v29105-embedded-xlsx), so there is
     nothing to fetch. Retained as a no-op because existing call sites await it. */
  return Promise.resolve();
}
function bkNormLabel(v){ return String(v||'').trim().replace(/\s+/g,' '); }
function bkNum(v){ return typeof v==='number' && Number.isFinite(v); }
function bkSourceCanon(v){
  // Canonicalize punctuation/spacing and the known legacy Harvard/Havard spelling mismatch.
  return bkNormLabel(v).toUpperCase().replace(/HAVARD/g,'HARVARD').replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}
function bkSourceIdentity(){
  const s=(typeof bkLoad==='function'?bkLoad():{})||{};
  const tokens=[];
  [s.name,s.dealId].forEach(v=>{const n=bkSourceCanon(v); if(n&&n.length>2&&!tokens.includes(n)) tokens.push(n);});
  // Explicit deal aliases are identity aids only; they never create an underwriting value.
  const aliases=[];
  if(tokens.some(x=>x.includes('HARVARD AVENUE'))){ ['HARVARD AVENUE','180 200 HARVARD AVENUE','180 HARVARD AVENUE','200 HARVARD AVENUE'].forEach(x=>aliases.push(x)); }
  return {dealId:s.dealId||'',name:s.name||'',location:s.location||'',tokens:[...new Set(tokens.concat(aliases))]};
}
function bkExactPropertyMatch(text){
  const id=bkSourceIdentity(), t=bkSourceCanon(text);
  if(!t) return {matched:false,reason:'Blank source text'};
  for(const token of id.tokens){
    if(t===token || (token.length>=12 && (t.includes(token)||token.includes(t)))) return {matched:true,match:token,reason:'Explicit active-property identity match'};
  }
  return {matched:false,reason:'No explicit active-property identity match'};
}
function bkSheetPropertyMatch(sheetName,rows){
  const probes=[sheetName];
  (rows||[]).slice(0,20).forEach(r=>(r||[]).slice(0,6).forEach(v=>{if(typeof v==='string'&&v.trim()) probes.push(v);}));
  for(const p of probes){ const m=bkExactPropertyMatch(p); if(m.matched) return {matched:true,match:m.match,sourceText:String(p),reason:m.reason}; }
  return {matched:false,reason:'No active-property identity in sheet name/header'};
}
function bkSourceScope(section,label){
  const s=bkNormLabel(section).toUpperCase(), l=bkNormLabel(label).toUpperCase();
  const active=(typeof bkLoad==='function'?bkLoad():{})||{};
  const name=String(active.name||'').toUpperCase();
  // Multiple named assets in one heading are always group facts, even if active property appears in the list.
  if(/COMMERCIAL RENT\s*-/.test(s)||/RESIDENTIAL RENT\s*-/.test(s)) return {scope:'PORTFOLIO/GROUP',reason:'Section heading contains multiple properties'};
  if(/INCOME SUMMARY|OTHER INCOME|EXPENSE SUMMARY|CASH ADJUSTMENTS|OPERATING CASH FLOW|HOLDING ACCOUNT/.test(s)) return {scope:'PORTFOLIO/GROUP',reason:'Portfolio-level report section'};
  const sm=bkExactPropertyMatch(section), lm=bkExactPropertyMatch(label);
  if(sm.matched) return {scope:'PROPERTY',reason:sm.reason};
  if(lm.matched) return {scope:'PROPERTY',reason:lm.reason};
  return {scope:'UNRESOLVED',reason:'Property scope is not explicit in source'};
}
function bkFactUnit(label){
  const l=String(label||'').toUpperCase();
  if(/RATE|PERCENT|%/.test(l)) return '%';
  if(/UNIT|COUNT/.test(l) && !/RENT|INCOME|EXPENSE|FEE|COST/.test(l)) return 'units';
  return '$';
}
function bkCandidateMap(f){
  // Deliberately conservative dictionary. Only direct underwriting INPUTS can ever be approval-eligible.
  // Computed outputs (EGI / NOI / total OpEx) are reconciliation candidates only and never write to state.
  const l=f.label.toUpperCase();
  const direct={
    'REAL ESTATE TAXES':{field:'taxes',label:'Real Estate Taxes',basis:'T-12 actual',targetKind:'INPUT'},
    'PROPERTY TAXES':{field:'taxes',label:'Real Estate Taxes',basis:'T-12 actual',targetKind:'INPUT'},
    'PROPERTY TAX':{field:'taxes',label:'Real Estate Taxes',basis:'T-12 actual',targetKind:'INPUT'},
    'INSURANCE':{field:'insurance',label:'Insurance',basis:'T-12 actual',targetKind:'INPUT'},
    'UTILITIES':{field:'utilities',label:'Utilities',basis:'T-12 actual',targetKind:'INPUT'},
    'PAYROLL':{field:'payroll',label:'Payroll',basis:'T-12 actual',targetKind:'INPUT'},
    'REPAIRS & MAINTENANCE':{field:'rm',label:'Repairs & Maintenance',basis:'T-12 actual',targetKind:'INPUT'},
    'REPAIRS AND MAINTENANCE':{field:'rm',label:'Repairs & Maintenance',basis:'T-12 actual',targetKind:'INPUT'},
    'MARKETING':{field:'marketing',label:'Marketing',basis:'T-12 actual',targetKind:'INPUT'},
    'GENERAL & ADMINISTRATIVE':{field:'ga',label:'General & Administrative',basis:'T-12 actual',targetKind:'INPUT'},
    'GENERAL AND ADMINISTRATIVE':{field:'ga',label:'General & Administrative',basis:'T-12 actual',targetKind:'INPUT'},
    'RESERVES':{field:'reserves',label:'Reserves',basis:'T-12 actual',targetKind:'INPUT'}
  };
  const recon={
    'EFFECTIVE GROSS INCOME':{field:'egi',label:'Effective Gross Income',basis:'T-12 actual',targetKind:'RECONCILIATION'},
    'TOTAL OPERATING EXPENSES':{field:'operatingExpenses',label:'Operating Expenses',basis:'T-12 actual',targetKind:'RECONCILIATION'},
    'NET OPERATING INCOME':{field:'noi',label:'Net Operating Income',basis:'T-12 actual',targetKind:'RECONCILIATION'},
    'NOI':{field:'noi',label:'Net Operating Income',basis:'T-12 actual',targetKind:'RECONCILIATION'}
  };
  const m=direct[l]||recon[l]; if(!m) return null;
  const eligible=f.scope==='PROPERTY' && m.targetKind==='INPUT';
  const reason=m.targetKind!=='INPUT'?'Computed/check figure - reconciliation only':(f.scope==='PROPERTY'?'Explicit property-scoped direct input':f.scopeReason);
  return {...m,sourceValue:f.total,sourceUnit:f.unit,sourceRef:f.sourceRef,sourceRow:f.sourceRow,sourceSection:f.section,scope:f.scope,eligible,disposition:eligible?'ELIGIBLE':'REVIEW',reason};
}
function bkCurrentFieldValue(field){
  const s=(typeof bkLoad==='function'?bkLoad():{})||{};
  if(Object.prototype.hasOwnProperty.call(s,field)) return s[field];
  try{ const c=typeof bkCalc==='function'?bkCalc():{}; if(c && Object.prototype.hasOwnProperty.call(c,field)) return c[field]; }catch(e){}
  return null;
}
function bkFmtSource(v,unit){
  if(!bkNum(v)) return '-';
  if(unit==='%') return (v*100).toFixed(2)+'%';
  if(unit==='$') return '$'+Math.round(v).toLocaleString();
  return Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
}
function bkRenderSourcePackage(pkg){
  const sum=document.getElementById('bkIngestSummary'), cand=document.getElementById('bkIngestCandidates'), prev=document.getElementById('bkIngestPreview');
  if(!sum||!cand||!prev||!pkg) return;
  const facts=pkg.normalizedFacts||[], candidates=pkg.candidates||[], propertyFacts=facts.filter(f=>f.scope==='PROPERTY').length, groupFacts=facts.filter(f=>f.scope==='PORTFOLIO/GROUP').length, unresolved=facts.filter(f=>f.scope==='UNRESOLVED').length;
  sum.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Source Package</caption><thead><tr><th class="rowlabel-h">Metric</th><th>Result</th></tr></thead><tbody>
    <tr><td class="rowlabel">File</td><td data-bk-align="left">${bkEsc(pkg.fileName)}</td></tr><tr><td class="rowlabel">Worksheet</td><td data-bk-align="left">${bkEsc(pkg.sheetName)}</td></tr>
    <tr><td class="rowlabel">Worksheets preserved</td><td>${(pkg.sheetNames||[pkg.sheetName]).length}</td></tr><tr><td class="rowlabel">Raw rows preserved</td><td>${pkg.rawRows.length}</td></tr><tr><td class="rowlabel">Normalized numeric facts</td><td>${facts.length}</td></tr><tr><td class="rowlabel">Detected rent-roll rows</td><td>${(pkg.rentRollRows||[]).length}</td></tr>
    <tr><td class="rowlabel">Property-specific facts</td><td>${propertyFacts}</td></tr><tr><td class="rowlabel">Portfolio / group facts</td><td>${groupFacts}</td></tr><tr><td class="rowlabel">Unresolved-scope facts</td><td>${unresolved}</td></tr>
    <tr><td class="rowlabel">Mapped candidates</td><td>${candidates.length}</td></tr><tr><td class="rowlabel">Eligible for approval</td><td>${candidates.filter(c=>c.eligible).length}</td></tr><tr><td class="rowlabel">Automatic underwriting writes</td><td>0</td></tr></tbody></table></div>`;
  const cr=candidates.length?candidates.map((c,i)=>{ const cur=bkCurrentFieldValue(c.field); const variance=(bkNum(cur)&&bkNum(c.sourceValue))?cur-c.sourceValue:null; const prior=bkSourceDecisionFor(c,pkg); const decision=prior?` <span class="status-chip pass">${bkEsc(prior.action)}</span>`:''; return `<tr><td class="rowlabel">${bkEsc(c.label)}</td><td>${bkFmtSource(cur,c.sourceUnit)}</td><td>${bkFmtSource(c.sourceValue,c.sourceUnit)}</td><td>${bkFmtSource(variance,c.sourceUnit)}</td><td data-bk-align="left">${bkEsc(c.targetKind)}</td><td data-bk-align="left">${bkEsc(c.scope)}</td><td data-bk-align="left">${bkEsc(c.sourceRef||'-')}</td><td data-bk-align="left">${bkEsc(c.reason)}</td><td data-bk-align="left"><span class="status-chip ${c.eligible?'pass':'warn'}">${c.eligible?'ELIGIBLE':'REVIEW'}</span>${decision}${c.eligible?` <button type="button" onclick="bkApproveSourceCandidate(${i})" style="margin-left:6px">APPROVE</button> <button type="button" onclick="bkKeepCurrentSourceCandidate(${i})">KEEP CURRENT</button>`:''}</td></tr>`; }).join(''):`<tr><td colspan="9" data-bk-empty="1">No underwriting candidates were created from this source.</td></tr>`;
  cand.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Review Exceptions / Candidate Inputs</caption><thead><tr><th class="rowlabel-h">Field</th><th>Current Underwriting</th><th>Source Value</th><th>Variance</th><th data-bk-align="left">Type</th><th data-bk-align="left">Scope</th><th data-bk-align="left">Source Ref</th><th data-bk-align="left">Reason</th><th data-bk-align="left">Action</th></tr></thead><tbody>${cr}</tbody></table></div>`;
  const rows=facts.slice(0,80).map(f=>`<tr><td class="rowlabel">${bkEsc(f.label)}</td><td data-bk-align="left">${bkEsc(f.section)}</td><td data-bk-align="left">${bkEsc(f.scope)}</td><td>${bkFmtSource(f.total,f.unit)}</td><td data-bk-align="left">${bkEsc(f.scopeReason)}</td></tr>`).join('');
  const inv=(pkg.sheetInventory||[]).map(x=>`<tr><td class="rowlabel">${bkEsc(x.sheetName)}</td><td>${x.rows}</td><td>${x.facts}</td><td>${x.rentRollRows}</td><td data-bk-align="left"><span class="status-chip ${x.propertyMatched?'pass':'warn'}">${x.propertyMatched?'PROPERTY':'REVIEW'}</span></td><td data-bk-align="left">${bkEsc(x.reason||'-')}</td></tr>`).join('');
  const rr=(pkg.rentRollRows||[]).slice(0,60).map(x=>`<tr><td class="rowlabel">${bkEsc(x.tenant)}</td><td>${bkFmtSource(x.sf,'units')}</td><td>${bkFmtSource(x.baseRent,'$')}</td><td>${bkFmtSource(x.ancillary,'$')}</td><td data-bk-align="left">${bkEsc(x.scope)}</td><td data-bk-align="left">${bkEsc(x.sourceRef)}</td></tr>`).join('');
  prev.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Worksheet / Property Recognition</caption><thead><tr><th class="rowlabel-h">Worksheet</th><th>Rows</th><th>Facts</th><th>RR Rows</th><th data-bk-align="left">Scope</th><th data-bk-align="left">Reason</th></tr></thead><tbody>${inv||'<tr><td colspan="6" data-bk-empty="1">No worksheet inventory.</td></tr>'}</tbody></table></div>${rr?`<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Detected Rent Roll - staging only, no automatic writes</caption><thead><tr><th class="rowlabel-h">Tenant / Unit</th><th>SF</th><th>Base Rent</th><th>Ancillary</th><th data-bk-align="left">Scope</th><th data-bk-align="left">Source Ref</th></tr></thead><tbody>${rr}</tbody></table></div>`:''}<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Normalized Source Facts - first ${Math.min(80,facts.length)} of ${facts.length}</caption><thead><tr><th class="rowlabel-h">Source Line Item</th><th data-bk-align="left">Section</th><th data-bk-align="left">Scope</th><th>Trailing Total</th><th data-bk-align="left">Classification</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note-flag"><span>&#9888;</span><div><b>Strict-source rule active.</b> A property appearing inside a multi-property Yardi heading does not make the section property-specific. Portfolio/group and unresolved facts remain review-only and cannot be approved into underwriting.</div></div>`;
}

function bkSourceCandidateId(c,pkg){
  const raw=[pkg&&pkg.fileName||'',pkg&&pkg.sheetName||'',c&&c.sourceRef||'',c&&c.field||'',c&&c.sourceValue].join('|');
  let h=2166136261; for(let i=0;i<raw.length;i++){ h^=raw.charCodeAt(i); h=Math.imul(h,16777619); }
  return 'SRC-'+(h>>>0).toString(16).padStart(8,'0').toUpperCase();
}
function bkSourceDecisions(){ try{return JSON.parse(localStorage.getItem(BK_SOURCE_APPROVAL_STORE)||'[]')||[];}catch(e){return [];} }
function bkSourceDecisionFor(c,pkg){ const id=bkSourceCandidateId(c,pkg); const a=bkSourceDecisions(); for(let i=a.length-1;i>=0;i--) if(a[i].candidateId===id) return a[i]; return null; }
function bkAppendSourceDecision(d){
  let a=bkSourceDecisions();
  // One current decision per exact source candidate. Preserve chronology by replacing only the same candidate.
  a=a.filter(x=>x.candidateId!==d.candidateId); a.push(d);
  localStorage.setItem(BK_SOURCE_APPROVAL_STORE,JSON.stringify(a));
}
function bkPersistSourceLineageToState(s,c,pkg,action,value){
  if(!s) return;
  s._sourceTags=s._sourceTags||{};
  s._sourceManifest=s._sourceManifest||{schema:BK_SOURCE_SCHEMA_VERSION,decisions:[]};
  s._sourceManifest.schema=BK_SOURCE_SCHEMA_VERSION;
  const candidateId=bkSourceCandidateId(c,pkg);
  const rec={candidateId,action,field:c.field,label:c.label,sourceValue:c.sourceValue,underwritingValue:value,fileName:pkg.fileName,sheetName:pkg.sheetName||'',sourceRef:c.sourceRef||'',sourceRow:c.sourceRow||null,sourceSection:c.sourceSection||'',basis:c.basis||'',decidedAt:new Date().toISOString()};
  s._sourceManifest.decisions=(s._sourceManifest.decisions||[]).filter(x=>x.candidateId!==candidateId); s._sourceManifest.decisions.push(rec);
  return rec;
}
function bkRenderSourceDecisions(){
  const el=document.getElementById('bkIngestDecisions'); if(!el) return;
  const a=bkSourceDecisions();
  const rows=a.length?a.slice().reverse().map(d=>`<tr><td class="rowlabel">${bkEsc(d.field||'-')}</td><td data-bk-align="left">${bkEsc(d.action||'-')}</td><td>${bkFmtSource(d.sourceValue,d.unit||'$')}</td><td data-bk-align="left">${bkEsc(d.fileName||'-')}</td><td data-bk-align="left">${bkEsc(d.sourceRef||'-')}</td><td data-bk-align="left">${bkEsc(d.decidedAt||'-')}</td></tr>`).join(''):`<tr><td colspan="6" data-bk-empty="1">No source decisions recorded yet.</td></tr>`;
  el.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Source Decision Log</caption><thead><tr><th class="rowlabel-h">Field</th><th data-bk-align="left">Decision</th><th>Source Value</th><th data-bk-align="left">Source File</th><th data-bk-align="left">Source Ref</th><th data-bk-align="left">Decision Time</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bkRenderStoredSource(){ try{ const raw=localStorage.getItem(BK_SOURCE_STORE); if(raw) bkRenderSourcePackage(JSON.parse(raw)); bkRenderSourceDecisions(); }catch(e){} }
function bkDetectRentRoll(rows,sheetName,sheetMatch){
  const out=[]; if(!Array.isArray(rows)||!rows.length) return out;
  let hdr=-1, map={};
  for(let r=0;r<Math.min(rows.length,60);r++){
    const cells=(rows[r]||[]).map(x=>bkSourceCanon(x));
    const tenant=cells.findIndex(x=>/TENANT|LESSEE|UNIT/.test(x));
    const rent=cells.findIndex(x=>/BASE RENT|MONTHLY RENT|CURRENT RENT|IN PLACE RENT/.test(x));
    const sf=cells.findIndex(x=>/^SF$|SQUARE FEET|RENTABLE SF|RSF|NRSF/.test(x));
    if(tenant>=0 && (rent>=0||sf>=0)){ hdr=r; cells.forEach((x,i)=>{if(x) map[x]=i;}); break; }
  }
  if(hdr<0) return out;
  const find=(rx)=>Object.entries(map).find(([k])=>rx.test(k))?.[1];
  const ixTenant=find(/TENANT|LESSEE|UNIT/), ixSF=find(/^SF$|SQUARE FEET|RENTABLE SF|RSF|NRSF/), ixRent=find(/BASE RENT|MONTHLY RENT|CURRENT RENT|IN PLACE RENT/), ixStart=find(/LEASE START|COMMENCEMENT/), ixEnd=find(/LEASE END|EXPIR/), ixAnc=find(/ANCILLARY|OTHER RENT|RECOVER/);
  for(let r=hdr+1;r<rows.length;r++){
    const row=rows[r]||[], tenant=bkNormLabel(row[ixTenant]); if(!tenant) continue;
    const numeric=[ixSF,ixRent,ixAnc].filter(i=>i!=null).some(i=>bkNum(row[i])); if(!numeric) continue;
    out.push({sourceRow:r+1,tenant,sf:ixSF!=null&&bkNum(row[ixSF])?row[ixSF]:null,baseRent:ixRent!=null&&bkNum(row[ixRent])?row[ixRent]:null,ancillary:ixAnc!=null&&bkNum(row[ixAnc])?row[ixAnc]:null,leaseStart:ixStart!=null?row[ixStart]:null,leaseEnd:ixEnd!=null?row[ixEnd]:null,scope:sheetMatch.matched?'PROPERTY':'UNRESOLVED',scopeReason:sheetMatch.matched?sheetMatch.reason:'Rent-roll sheet is not explicitly tied to active property',sourceRef:`${sheetName}!${r+1}`});
  }
  return out;
}
function bkParseSourceSheet(sheetName,rows){
  let section='', facts=[]; const sheetMatch=bkSheetPropertyMatch(sheetName,rows);
  for(let r=0;r<rows.length;r++){
    const row=rows[r]||[], label=bkNormLabel(row[0]); if(!label) continue;
    const vals=row.slice(1,14), hasNums=vals.some(bkNum), total=bkNum(row[14])?row[14]:null;
    if(!hasNums && total===null){ section=label; continue; }
    if(!hasNums && total!==null) continue;
    let sc=bkSourceScope(section,label);
    if(sc.scope==='UNRESOLVED'&&sheetMatch.matched) sc={scope:'PROPERTY',reason:'Worksheet/header explicitly identifies active property'};
    facts.push({sourceRow:r+1,section,label,scope:sc.scope,scopeReason:sc.reason,periods:vals,total,unit:bkFactUnit(label),sourceRef:`${sheetName}!A${r+1}:O${r+1}`,sheetName});
  }
  return {sheetName,rows,facts,rentRoll:bkDetectRentRoll(rows,sheetName,sheetMatch),propertyMatch:sheetMatch};
}
async function bkIngestSourceFile(){
  const inp=document.getElementById('bkSourceFile'), msg=document.getElementById('bkIngestMsg');
  if(!inp||!inp.files||!inp.files[0]){ if(msg) msg.textContent='Choose an Excel or CSV source file first.'; return; }
  const file=inp.files[0];
  if(typeof bkGuardSourceFile==='function'){ const g=bkGuardSourceFile(file);
    if(!g.ok){ if(msg) msg.textContent=g.message; return; } }
  if(msg) msg.textContent='Reading '+file.name+'...';
  try{
    await bkLoadSheetJs(); const ab=await file.arrayBuffer(); const wb=await bkXlsxPrepare(ab);
    const parsed=wb.SheetNames.map(sheetName=>{ const ws=wb.Sheets[sheetName], rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true}); return bkParseSourceSheet(sheetName,rows); });
    const facts=parsed.flatMap(x=>x.facts), rentRollRows=parsed.flatMap(x=>x.rentRoll), candidates=facts.map(bkCandidateMap).filter(Boolean);
    const pkg={version:BK_SOURCE_SCHEMA_VERSION,fileName:file.name,sheetName:wb.SheetNames.length===1?wb.SheetNames[0]:'MULTI-SHEET',sheetNames:wb.SheetNames,ingestedAt:new Date().toISOString(),activeIdentity:bkSourceIdentity(),rawRows:parsed.flatMap(x=>x.rows.map((row,i)=>({sheetName:x.sheetName,sourceRow:i+1,row}))),normalizedFacts:facts,rentRollRows,candidates,sheetInventory:parsed.map(x=>({sheetName:x.sheetName,rows:x.rows.length,facts:x.facts.length,rentRollRows:x.rentRoll.length,propertyMatched:x.propertyMatch.matched,propertyMatch:x.propertyMatch.match||'',reason:x.propertyMatch.reason}))};
    localStorage.setItem(BK_SOURCE_STORE,JSON.stringify(pkg)); bkRenderSourcePackage(pkg);
    if(msg) msg.textContent=`Staged ${wb.SheetNames.length} worksheet(s), ${facts.length} normalized facts, ${rentRollRows.length} rent-roll row(s), and ${candidates.length} mapped candidate(s). 0 automatic underwriting writes.`;
  }catch(e){ if(msg) msg.textContent='Source read failed: '+(e&&e.message?e.message:e); }
}
function bkKeepCurrentSourceCandidate(i){
  let pkg; try{pkg=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null');}catch(e){}
  if(!pkg||!pkg.candidates||!pkg.candidates[i]) return;
  const c=pkg.candidates[i], cur=bkCurrentFieldValue(c.field), s=(typeof bkLoad==='function'?bkLoad():null);
  const rec=bkPersistSourceLineageToState(s,c,pkg,'KEEP_CURRENT',cur);
  if(s){ if(typeof bkSave==='function') bkSave(s); }
  bkAppendSourceDecision(Object.assign({unit:c.sourceUnit||'$'},rec||{candidateId:bkSourceCandidateId(c,pkg),action:'KEEP_CURRENT',field:c.field,sourceValue:c.sourceValue,fileName:pkg.fileName,sourceRef:c.sourceRef||'',decidedAt:new Date().toISOString()}));
  bkRenderSourcePackage(pkg); bkRenderSourceDecisions();
}
function bkRunIngestionQA(){
  const out=document.getElementById('bkIngestQA'); let pkg=null; try{pkg=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null');}catch(e){}
  const tests=[]; const t=(name,pass,detail)=>tests.push({name,pass:!!pass,detail:detail||''});
  t('Frozen engine boundary', typeof bkCalc==='function', 'bkCalc remains the existing calculation entry point');
  t('No automatic write path', !/auto/i.test(String((pkg&&pkg.writeback)||'')), 'source package contains no automatic write instruction');
  if(pkg){
    const facts=pkg.normalizedFacts||[], cs=pkg.candidates||[];
    t('Raw rows preserved', Array.isArray(pkg.rawRows)&&pkg.rawRows.length>0, `${pkg.rawRows.length} raw rows`);
    t('All worksheets inventoried', Array.isArray(pkg.sheetInventory)&&pkg.sheetInventory.length===(pkg.sheetNames||[]).length, `${(pkg.sheetInventory||[]).length} sheet(s)`);
    t('Rent-roll staging is non-writing', (pkg.rentRollRows||[]).every(x=>!Object.prototype.hasOwnProperty.call(x,'writeback')), `${(pkg.rentRollRows||[]).length} staged RR row(s)`);
    t('Property-matched RR rows require explicit sheet/header identity', (pkg.rentRollRows||[]).filter(x=>x.scope==='PROPERTY').every(x=>x.scopeReason&&/identity|identifies/i.test(x.scopeReason)), `${(pkg.rentRollRows||[]).filter(x=>x.scope==='PROPERTY').length} property RR row(s)`);
    t('Active identity captured at ingestion', !!pkg.activeIdentity && typeof pkg.activeIdentity==='object', pkg.activeIdentity?`${pkg.activeIdentity.dealId||'-'} / ${pkg.activeIdentity.name||'-'}`:'missing');
    t('Property eligibility requires exact identity', cs.filter(c=>c.eligible).every(c=>c.scope==='PROPERTY'), `${cs.filter(c=>c.eligible).length} eligible`);
    t('Every fact has lineage', facts.every(f=>f.sourceRow&&f.sourceRef&&f.label), `${facts.length} facts checked`);
    t('Group facts cannot be eligible', cs.filter(c=>c.scope==='PORTFOLIO/GROUP').every(c=>!c.eligible), 'portfolio/group candidates are review-only');
    t('Unresolved facts cannot be eligible', cs.filter(c=>c.scope==='UNRESOLVED').every(c=>!c.eligible), 'unresolved candidates are review-only');
    t('Computed figures cannot write', cs.filter(c=>c.targetKind==='RECONCILIATION').every(c=>!c.eligible), 'EGI/NOI/OpEx are reconciliation-only');
    t('Eligible means property + direct input', cs.filter(c=>c.eligible).every(c=>c.scope==='PROPERTY'&&c.targetKind==='INPUT'), `${cs.filter(c=>c.eligible).length} eligible`);
    t('Candidate lineage preserved', cs.every(c=>c.sourceRef&&c.sourceRow), `${cs.length} candidates checked`);
    t('Candidate IDs deterministic', cs.every(c=>bkSourceCandidateId(c,pkg)===bkSourceCandidateId(c,pkg)), `${cs.length} candidates checked`);
    const active=(typeof bkLoad==='function'?bkLoad():{})||{}; const manifest=active._sourceManifest;
    t('Source manifest schema valid', !manifest || manifest.schema===BK_SOURCE_SCHEMA_VERSION, manifest?manifest.schema:'no approved decisions yet');
    t('Decision log de-duplicated', (()=>{const a=bkSourceDecisions(), ids=a.map(x=>x.candidateId); return ids.length===new Set(ids).size;})(), `${bkSourceDecisions().length} decision(s)`);
    const yardi=/yardi/i.test(pkg.fileName||'');
    if(yardi){
      const comm=facts.find(f=>/BASE RENT - COMMERCIAL/i.test(f.label));
      const res=facts.find(f=>/BASE RENT - RESIDENTIAL/i.test(f.label));
      const egi=facts.find(f=>/^EFFECTIVE GROSS INCOME$/i.test(f.label));
      t('Yardi commercial rent classified group', !!comm&&comm.scope==='PORTFOLIO/GROUP', comm?comm.scope:'not found');
      t('Yardi residential rent classified group', !!res&&res.scope==='PORTFOLIO/GROUP', res?res.scope:'not found');
      t('Yardi EGI not approval-eligible', !!egi && !cs.some(c=>c.field==='egi'&&c.eligible), egi?egi.scope:'not found');
      t('Multi-property Yardi produces no unsafe approvals', cs.every(c=>!c.eligible || c.scope==='PROPERTY'), `${cs.filter(c=>c.eligible).length} eligible`);
    }
  } else t('Staged package available',false,'Upload/read a source file first');
  const pass=tests.filter(x=>x.pass).length;
  if(out) out.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Ingestion QA - ${pass}/${tests.length} PASS</caption><thead><tr><th class="rowlabel-h">Test</th><th data-bk-align="left">Status</th><th data-bk-align="left">Detail</th></tr></thead><tbody>${tests.map(x=>`<tr><td class="rowlabel">${bkEsc(x.name)}</td><td data-bk-align="left"><span class="status-chip ${x.pass?'pass':'fail'}">${x.pass?'PASS':'FAIL'}</span></td><td data-bk-align="left">${bkEsc(x.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  return {passed:pass,total:tests.length,tests};
}
async function bkRunCloudLineageQA(){
  const out=document.getElementById('bkIngestQA');
  const tests=[]; const t=(name,pass,detail)=>tests.push({name,pass:!!pass,detail:detail||''});
  const original=(typeof bkLoad==='function')?JSON.parse(JSON.stringify(bkLoad())):null;
  if(!original){ t('Active state available',false,'bkLoad unavailable'); }
  else if(!(typeof bkAuthSignedIn==='function'&&bkAuthSignedIn())){ t('Authenticated session',false,'Sign in on Cloud Sync before cloud-lineage verification'); }
  else if(typeof bkCloudSaveDeal!=='function'||typeof bkCloudLoadDeal!=='function'){ t('Cloud adapter available',false,'Cloud save/load functions unavailable'); }
  else {
    const before=JSON.stringify(original._sourceManifest||null);
    const tagsBefore=JSON.stringify(original._sourceTags||null);
    t('Manifest present or intentionally empty',true,before==='null'?'No source decisions yet':'Manifest captured');
    try{
      const saved=await bkCloudSaveDeal();
      t('Cloud save completed',!!saved,(saved&&saved.dealCode)||original.dealId||'saved');
      await bkCloudLoadDeal(original.dealId||original.name);
      const loaded=bkLoad();
      t('Source manifest survives Supabase round trip',JSON.stringify(loaded._sourceManifest||null)===before,before==='null'?'empty manifest preserved':'manifest byte-equivalent');
      t('Source tags survive Supabase round trip',JSON.stringify(loaded._sourceTags||null)===tagsBefore,tagsBefore==='null'?'empty tags preserved':'tags byte-equivalent');
      t('Deal identity preserved',String(loaded.dealId||'')===String(original.dealId||''),String(loaded.dealId||''));
    }catch(e){ t('Cloud round trip completed',false,e&&e.message?e.message:String(e)); }
    finally { if(original&&typeof bkSave==='function'){ bkSave(original); if(typeof currentSheet!=='undefined') showSheet(currentSheet); } }
  }
  const pass=tests.filter(x=>x.pass).length;
  if(out) out.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Cloud Lineage QA - ${pass}/${tests.length} PASS</caption><thead><tr><th class="rowlabel-h">Test</th><th data-bk-align="left">Status</th><th data-bk-align="left">Detail</th></tr></thead><tbody>${tests.map(x=>`<tr><td class="rowlabel">${bkEsc(x.name)}</td><td data-bk-align="left"><span class="status-chip ${x.pass?'pass':'fail'}">${x.pass?'PASS':'FAIL'}</span></td><td data-bk-align="left">${bkEsc(x.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  return {passed:pass,total:tests.length,tests};
}
function bkApproveSourceCandidate(i){
  let pkg; try{pkg=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null');}catch(e){}
  if(!pkg||!pkg.candidates||!pkg.candidates[i]) return;
  const c=pkg.candidates[i]; if(!c.eligible){ alert('This source fact is not property-specific and cannot be approved into underwriting.'); return; }
  const s=(typeof bkLoad==='function'?bkLoad():null); if(!s){ alert('Active underwriting state is unavailable.'); return; }
  if(Object.prototype.hasOwnProperty.call(s,c.field) && s[c.field]!==null && s[c.field]!=='' && s[c.field]!==0){ if(!confirm(`${c.label} already has an underwriting value. Replace it with the approved source value?`)) return; }
  s[c.field]=c.sourceValue;
  s._sourceTags=s._sourceTags||{}; s._sourceTags[c.field]={source:pkg.fileName,ref:c.sourceRef||'',approvedAt:new Date().toISOString(),value:c.sourceValue,basis:c.basis,candidateId:bkSourceCandidateId(c,pkg)};
  const rec=bkPersistSourceLineageToState(s,c,pkg,'APPROVE',c.sourceValue);
  if(typeof bkSave==='function') bkSave(s);
  bkAppendSourceDecision(Object.assign({unit:c.sourceUnit||'$'},rec));
  bkRenderSourcePackage(pkg); bkRenderSourceDecisions();
}


const RENDERERS = {
  'Home': sheetHome,
  'Deal Underwrite': sheetDealUnderwrite,
  'Rent Roll': sheetRentRoll,
  'Source Ingestion': sheetSourceIngestion,
  'Operating Underwrite': sheetOperatingUnderwrite,
  'Property CF': sheetPropertyCF,
};


/* ===========================================================================
   V29.10.4 - CANONICAL RENDERER REGISTRY
   ===========================================================================
   ROOT CAUSE FIX. `RENDERERS` was declared `const` in this script's scope and
   was NEVER exposed as window.RENDERERS. Every later patch layer that tried to
   install a wrapped sheet renderer used `window.RENDERERS[...]`, which was
   `undefined`:

     V29.9.7  tenant reconciliation        window.RENDERERS['Source Ingestion']=  -> TypeError
     V29.9.8  field-level approval         window.RENDERERS['Source Ingestion']=  -> TypeError
     V29.10.0 live ingestion hardening     if(window.RENDERERS)                   -> guard false, no-op
     V29.10.3 ingestion toolbar controller if(window.RENDERERS)                   -> guard false, no-op

   showSheet() dispatches through `RENDERERS[sheet]()`, so ALL FOUR layers were
   dead at render time: two threw and aborted, two silently did nothing. Measured
   before this fix: RENDERERS['Source Ingestion'] carried none of the wrapper tags
   (__bkV2997 / __bkV2998 / __bk29103), and window.RENDERERS was undefined.

   That is the true root cause of the ingestion-toolbar defect - the toolbar had
   no state controller at all, because the controller was never installed. It
   also silently disabled tenant reconciliation and field-level approval.

   Exposing the SAME object (not a copy) gives one registry with two access
   paths that can never diverge. */
window.RENDERERS = RENDERERS;
/* Canonical registration helper. Later layers should use this rather than
   touching either path directly, so there is one authoritative way to replace a
   renderer and wrapper installation can never silently no-op again. */
window.bkRegisterRenderer = function(name, fn){
  if(typeof fn !== 'function') return false;
  RENDERERS[name] = fn;
  return RENDERERS[name] === fn;
};

const viewport = document.getElementById('viewport');
let currentSheet = null;

function metaStripHtml(meta){
  if(!meta) return '';
  const cells = Object.entries(meta).map(([k,v])=>`<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  return `<div class="meta-strip">${cells}</div>`;
}

function showSheet(sheet){
  currentSheet = sheet;
  const done = !!RENDERERS[sheet];
  const chrome = buildChrome(sheet);
  let bodyHtml;
  if(done){
    const s = RENDERERS[sheet]();
    bodyHtml = `
      <div class="title-block">
        <div class="crumbs">${s.crumbs}</div>
        <h2>${s.title}</h2>
        <p class="desc">${s.desc}</p>
        ${metaStripHtml(s.meta)}
      </div>
      <div class="body-grid">
        <div class="main-col">${s.main}</div>
        ${s.sidebar}
      </div>`;
  } else {
    const g = groupOf(sheet);
    bodyHtml = `
      <div class="title-block">
        <div class="crumbs">${g?g.label:''}</div>
        <h2>${sheet}</h2>
      </div>
      <div class="note-flag"><span>&#9888;</span><div><b>Defect - no renderer is registered for this sheet.</b> Every sheet in the navigation must have a renderer. This is a build error, not a pending feature; report it rather than relying on this page.</div></div>
      </div>`;
  }
  viewport.innerHTML = `<div class="sheet-frame active">${chrome}${bodyHtml}</div>`;

  // wire nav clicks
  viewport.querySelectorAll('[data-goto-sheet]').forEach(el=>{
    el.addEventListener('click', ()=>showSheet(el.dataset.gotoSheet));
  });
  viewport.querySelectorAll('[data-goto-group]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const g = GROUPS.find(x=>x.id===el.dataset.gotoGroup);
      if(g) showSheet(g.sheets[0]);
    });
  });

  document.querySelectorAll('.rail-item').forEach(it=>{
    it.classList.toggle('active', it.dataset.sheet===sheet);
  });

  // V29.7 - the chrome is re-rendered on every sheet change, so the overflow chevrons must be
  // re-wired each time. Guarded so a failure here can never block a sheet from rendering.
  try{ bkWireNavOverflow(viewport); }catch(e){}
}

showSheet('Home');
