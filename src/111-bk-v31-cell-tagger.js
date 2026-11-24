
/* V31: tags every financial-table cell with what it IS, from its contents - an editable control,
   a pill, a number, text - never from row labels or column headings. The cell authority styles
   only from this tag. Writes attributes only when they change, so pages stay idle. */
(function(){
  var NUM=/^(\(?-?\$?\(?[\d,]*\.?\d+\)?\s*(%|x|bps|yrs?|mo)?\)?|-|\u2013|\u2014|n\/a|\$?-|\(\$?[\d,]*\.?\d+\))$/i;
  function t(e){ return (e.textContent||'').replace(/\u00a0/g,' ').trim(); }
  /* a figure, or a pair of figures shown as "A / B" (e.g. "$76,861 / $76,861") */
  function isNum(x){ x=String(x||'').replace(/\s+/g,' ').trim(); if(!x) return false;
    return x.split(' / ').every(function(p){ return NUM.test(p.replace(/\s+/g,'')); }); }
  function set(el,k,v){ if(el.getAttribute(k)!==v) el.setAttribute(k,v); }
  var GRID=false;
  function kindOf(td, i, tr){
    var ctl = td.querySelector('select,input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),textarea');
    /* structural: a value cell of an input row with a bound key is editable (bkWire makes it so
       after render, so the attribute itself cannot be relied on at tagging time) */
    var editable = td.isContentEditable || td.getAttribute('contenteditable')==='true' ||
                   (td.classList.contains('v') && tr.classList.contains('input') && tr.hasAttribute('data-bk-key'));
    if(ctl || editable){
      var fmt=(tr.dataset && tr.dataset.bkFmt)||'';
      var numeric = (ctl && ctl.tagName==='INPUT' && ctl.type==='number') ||
                    (!ctl && fmt && fmt!=='text' && fmt!=='date') ||
                    (!ctl && !fmt && isNum(t(td)));
      return numeric ? 'input-num' : 'input-text';
    }
    if(i===0) return 'label';
    var chips=td.querySelectorAll('.status-chip');
    var txt=t(td);
    if(chips.length){
      var rest=txt; chips.forEach(function(c){ rest=rest.replace(t(c),''); });
      if(!rest.replace(/[\s\u25cf\u2022]/g,'')) return 'chip';
    }
    if(!txt) return 'empty';
    /* a bare dash outside the Value column of an input grid is a placeholder, not a calculated figure */
    if(i>=2 && /^[-\u2013\u2014]$/.test(txt)) return 'empty';
    /* a figure in an input grid that is not itself editable is a calculated value */
    if(isNum(txt)) return (tr.classList.contains('input') || GRID) ? 'calc' : 'num';
    return 'text';
  }
  function run(){
    var vp=document.getElementById('viewport'); if(!vp) return;
    vp.querySelectorAll('.status-chip').forEach(function(c){
      var empty = !t(c).replace(/[\u25cf\u2022\s]/g,'');
      if(empty){ if(c.getAttribute('data-bk-pill-empty')!=='1') c.setAttribute('data-bk-pill-empty','1'); }
      else if(c.hasAttribute('data-bk-pill-empty')) c.removeAttribute('data-bk-pill-empty');
    });
    vp.querySelectorAll('table.fin').forEach(function(tb){
      var colNum={}, colAll={}, inNum={}, inTxt={}, hasSel={};
      GRID = !!tb.querySelector('tbody tr.input');
      tb.querySelectorAll('tbody tr').forEach(function(tr){
        var i=0;
        [].forEach.call(tr.children,function(td){
          var k=kindOf(td,i,tr); set(td,'data-bk-kind',k);
          if(k==='empty' && i>=2 && /^[-\u2013\u2014]$/.test(t(td))) set(td,'data-bk-ph','1'); else if(td.hasAttribute('data-bk-ph')) td.removeAttribute('data-bk-ph');
          if(!td.hasAttribute('colspan')){
            if(k==='input-num') inNum[i]=(inNum[i]||0)+1; else if(k==='input-text') inTxt[i]=(inTxt[i]||0)+1;
            if(/^input/.test(k) && td.querySelector('select')) hasSel[i]=1; }
          if(!td.hasAttribute('colspan')){ colAll[i]=(colAll[i]||0)+(k==='empty'?0:1); if(/num|calc/.test(k)) colNum[i]=(colNum[i]||0)+1; }
          i+=Number(td.getAttribute('colspan')||1);
        });
      });
      /* a column is numeric when most of its filled cells are figures; text inside a numeric
         column ("Pari passu", "IRR") follows the column so every column has ONE alignment */
      var tableIsGrid = !!tb.querySelector('tbody tr.input') || tb.classList.contains('bk-grid4') || tb.classList.contains('bk-grid3');
      tb.querySelectorAll('tbody tr').forEach(function(tr){
        var i=0;
        [].forEach.call(tr.children,function(td){
          var span=Number(td.getAttribute('colspan')||1), numCol = i>0;
          for(var c=i;c<i+span && numCol;c++){ numCol = !!(colAll[c] && colNum[c]/colAll[c] >= 0.5); }
          if(span>1 && i===0) numCol=false;
          var k=td.getAttribute('data-bk-kind');
          /* a column that holds mostly editable figures aligns its editable text/dropdowns with them */
          var colIsNum = !!(colAll[i] && colNum[i]/colAll[i] >= 0.5);
          var mixNum = span===1 && i>0 && k==='input-text' && colIsNum;
          var leftFig = !tableIsGrid && span===1 && i>0 && (k==='num'||k==='calc') && colAll[i] && colNum[i]/colAll[i] < 0.5;
          if((numCol && (k==='text'||k==='empty'||k==='chip')) || mixNum) set(td,'data-bk-col','num');
          else if(leftFig) set(td,'data-bk-col','left');
          else if(td.hasAttribute('data-bk-col')) td.removeAttribute('data-bk-col');
          var gut = span===1 && i>0 && /^input/.test(k) && hasSel[i] && colIsNum;
          if(gut) set(td,'data-bk-gutter','1'); else if(td.hasAttribute('data-bk-gutter')) td.removeAttribute('data-bk-gutter');
          i+=Number(td.getAttribute('colspan')||1);
        });
      });
      /* print-legacy (design-system phase 1): the column-count classes below (bk-vt2-4, bk-tt2-4, bk-grid3-4) now feed only the PRINT geometry kept in
         the print-legacy blocks (110, 162a, 182, 186; active only under html.bk-printing), so printed pages stay exactly as they were. The screen lays tables out from the table standard further down.
         Remove these classes with those blocks in phase 5, when print adopts the standard. */
      /* every financial table whose 2nd column is figures shares ONE value line (60% of the card), so tables stacked on a page never disagree */
      var nc=0; [].some.call(tb.querySelectorAll('tbody tr'),function(r){ if(r.querySelector('[colspan]')) return false; nc=r.children.length; return true; });
      var hr0=tb.querySelector('thead tr:last-child');
      var isG0=!!tb.querySelector('tbody tr.input') || tb.classList.contains('bk-grid4') || tb.classList.contains('bk-grid3') ||
               !!(hr0 && (hr0.children.length===3||hr0.children.length===4) && /^field$/i.test(t(hr0.children[0])) && /^value$/i.test(t(hr0.children[1])));
      var col3Num = nc>=3 && colAll[2] && colNum[2]/colAll[2]>=0.5;   /* a time-series schedule (figure | figure | figure) is not a value/basis table */
      var vt = (!isG0 && nc>=2 && nc<=4 && !col3Num && colAll[1] && colNum[1]/colAll[1]>=0.5 && !tb.classList.contains('bk-m-scroll')) ? 'bk-vt'+nc : '';
      var tt = (!isG0 && !vt && nc>=2 && nc<=4 && !col3Num && !tb.classList.contains('bk-m-scroll') && !(nc>2 && tb.classList.contains('wrap'))) ? 'bk-tt'+nc : '';
      ['bk-tt2','bk-tt3','bk-tt4'].forEach(function(c){ if(c!==tt && tb.classList.contains(c)) tb.classList.remove(c); });
      if(tt && !tb.classList.contains(tt)) tb.classList.add(tt);
      ['bk-vt2','bk-vt3','bk-vt4'].forEach(function(c){ if(c!==vt && tb.classList.contains(c)) tb.classList.remove(c); });
      if(vt && !tb.classList.contains(vt)) tb.classList.add(vt);
      var hr=tb.querySelector('thead tr:last-child'); if(!hr) return;
      /* input grids (tables of editable rows) share ONE column geometry app-wide, so stacked grids
         line up: Field | Value | Units/Type/Basis | Status */
      var nh=hr.children.length, isGrid=!!tb.querySelector('tbody tr.input');
      /* a Field | Value | ... table is an input grid even when every row is linked / read-only, so stacked tables never disagree */
      if(!isGrid && (nh===3||nh===4) && /^field$/i.test(t(hr.children[0])) && /^value$/i.test(t(hr.children[1]))) isGrid=true;
      var g = isGrid && nh===4 ? 'bk-grid4' : (isGrid && nh===3 ? 'bk-grid3' : '');
      ['bk-grid4','bk-grid3'].forEach(function(c){ if(c!==g && tb.classList.contains(c)) tb.classList.remove(c); });
      if(g && !tb.classList.contains(g)) tb.classList.add(g);
      var i=0;
      [].forEach.call(hr.children,function(th){
        var k = (i>0 && colAll[i] && colNum[i]/colAll[i] >= 0.5) ? 'num' : 'text';
        set(th,'data-bk-kind',k); i+=Number(th.getAttribute('colspan')||1);
      });
    });
  }
  /* ===== THE TABLE STANDARD (design-system phase 1) =====
     Every financial table gets a FAMILY and every column a ROLE, read from what its cells hold (the kinds above), never from its position or its column count.
     Each role has one width measured from its content; tables stacked in one column share the widest measurement of a role, so their columns line up.
     Families:  kv     label + values, no long text: the label takes the spare width
                kvn    has a long-text column (basis, assumption, evidence): the label is measured (20-36%), the long text takes the spare width
                ledger a short label (a month, a year) and figures only: the figures share the width equally
                period five or more period columns (Year 1..N, months, Total): equal periods, the label measured, sideways scroll past the panel
                matrix a heat map (cells with their own fills): its own layout, untouched
                complex a header that spans columns or has several rows: keeps its own layout
     The widths are written as --bk-cw on the sizing row and only the screen table stylesheet (src/209) reads them, so print keeps its own layout (phase 5).
     Status labels get a TIER (data-bk-tier) from their words, so a source note, a test result, a row's role, a setting and an action each have their own form.
     The words themselves are never changed. Writes only when something changed, so pages stay idle. */
  var TIER=[['action',null],
    ['prov',/^(INPUT|DEFAULT|CUSTOM|OVERRIDDEN|OVERRIDE|CALCULATED|CALC|LINKED|SOURCE|UNDERWRITING|FIXED|LIVE|PARAMETRIC|DERIVED|ENGINE)$/],
    ['pass',/^(ALL INPUTS TIE|PASS|PASSED|TIES|TIE|MET|OK|VALIDATED|IN RANGE|COMPLETE|CONCLUDED|INVESTMENT READY.*|PRODUCING FINITE RESULTS|TAX-GRADE|VALUE CREATED|APPROVE|APPROVED|CONFIGURED|READY)$/],
    ['warn',/^(PARTIAL|ABOVE RANGE|BELOW RANGE|WARN|WARNING|BINDING|CONDITIONAL|REVIEW|PENDING|NOT REPORTED|STALE)$/],
    ['fail',/^(FAIL|FAILED|FIX|NOT MET|DECLINE|DECLINED|ERROR|BROKEN|BREACH)$/],
    ['na',/^(N\/A|NA|NOT APPLIED|NOT APPLICABLE|NOT MODELLED|NONE)$/],
    ['role',/^(CAPACITY|HARD|SOFT|LENDER DSCR|HOUSE DSCR|ALTERNATIVE|SPONSOR SIDE|GOVERNING|OPTIONAL)$/],
    ['state',/^(ON|OFF|ACTIVE|INERT|SIGNED[ -]OUT|SIGNED IN|SELECTED|UNTESTED|NO SNAPSHOTS|INCLUDED|EXCLUDED|IN SPONSOR CF|LOCAL ONLY|DRAFT|SUBMITTED FOR IC)$/]];
  function tierOf(c){
    if(c.tagName==='BUTTON' || c.getAttribute('role')==='button' || c.hasAttribute('onclick')) return 'action';
    var k=c.getAttribute('data-bk-chip')||''; if(k==='input') return 'prov'; if(k==='na') return 'na'; if(k==='optional') return 'role';   /* a TEMPLATE default stays a caution (its warn class): it asks for a review */
    var w=t(c).replace(/^[■●•▪✓✗\s]+/,'').replace(/\s+/g,' ').toUpperCase();
    for(var i=1;i<TIER.length;i++) if(TIER[i][1].test(w)) return TIER[i][0];
    if(c.classList.contains('pass')) return 'pass'; if(c.classList.contains('fail')) return 'fail'; if(c.classList.contains('warn')) return 'warn';
    return 'neutral';
  }
  var FLOOR={amount:96,rate:72,unit:28,status:96,period:84,input:128,choice:128,short:64}, CEIL={amount:170,rate:130,unit:90,status:220,period:150,input:180,choice:320,short:360};
  var FIG=/^(?=.*\d)[\s(−$\-]*[\d$(][\d,.$%x()−\- ]*(bps|yrs?|x|%|mo)?\)?$/i, PERIOD=/year|yr\b|month|^20\d\d|^q[1-4]\b|^m\d|total|forecast|^close$|^stab/i;
  var cv=null; function tw(el,txt){ if(!cv) cv=document.createElement('canvas').getContext('2d'); var cs=getComputedStyle(el); cv.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
    var m=0; String(txt).split('\n').forEach(function(l){ m=Math.max(m,cv.measureText(l.trim()).width); }); return m+(parseFloat(cs.letterSpacing)||0)*String(txt).length; }
  function own(c){ var x=c.cloneNode(true); [].forEach.call(x.querySelectorAll('.bk-sub,select,option'),function(n){ n.remove(); }); return x.textContent.replace(/\s+/g,' ').trim(); }
  function inScope(tb){ return tb.offsetParent && !tb.classList.contains('rp-tbl') && !tb.classList.contains('ae-grid') && !tb.closest('.rp, .ae, .gd-su'); }
  function setStyle(el,k,v){ if(el.style.getPropertyValue(k)!==v) el.style.setProperty(k,v); }
  function classify(tb){
    var heads=tb.tHead?tb.tHead.rows:[], hr=heads.length?heads[heads.length-1]:tb.rows[0]; if(!hr) return null;
    var hs=[].slice.call(hr.cells), n=hs.length; if(n<2) return {fam:'complex',hs:hs};   /* a header that is one spanning cell keeps its own layout */
    var body=[].filter.call(tb.rows,function(r){ return r!==hr && !(tb.tHead && tb.tHead.contains(r)) && r.cells.length===n && !r.hasAttribute('data-bk-group') && ![].some.call(r.cells,function(c){ return c.colSpan>1; }); });
    if(tb.querySelectorAll('td[style*="background"]').length>8) return {fam:'matrix',hs:hs};
    if(heads.length>1 || hs.some(function(c){ return c.colSpan>1; }) || n>14 || !body.length) return {fam:'complex',hs:hs};
    var isPeriod = n>=5 && hs.slice(1).filter(function(h){ return PERIOD.test(t(h)); }).length>=n-2;
    var roles=hs.map(function(h,i){
      if(i===0) return 'label'; if(isPeriod) return 'period';
      var cells=body.map(function(r){ return r.cells[i]; }), k=cells.map(function(c){ return c.getAttribute('data-bk-kind')||''; }),
          cnt=function(x){ return k.filter(function(v){ return v.indexOf(x)===0; }).length; }, txt=cells.map(own), filled=txt.filter(Boolean).length, ht=t(h).toLowerCase();
      if(h.classList.contains('bk-col-chip') || cnt('chip')>=Math.max(1,(k.length-cnt('empty'))/2)) return 'status';
      if(cells.some(function(c){ return c.querySelector('select'); })) return 'choice';
      /* a free-text entry box (a mitigant, a reason, a name: declared 200 px or more) is text, not a figure: it shares the spare width like a note */
      if(cells.some(function(c){ var ip=c.querySelector('input[type=text]'), pw=ip&&/width:\s*(\d+)px/.exec(ip.getAttribute('data-bk-pw')||''); return pw && +pw[1]>=200; })) return 'note';
      if(cnt('input')>=Math.max(1,k.length/2) || cells.some(function(c){ return c.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=file])'); })) return 'input';
      /* a unit column holds units (%, $, years, $/SF): a column headed Units that holds explanations is text, and is laid out as text */
      var unitLen=txt.every(function(x){ return x.length<=10; });
      if(((h.classList.contains('bk-uom') || /^(units?|uom)$/.test(ht)) && unitLen) || (filled && txt.every(function(x){ return x.length<=3; }) && cnt('num')+cnt('calc')===0)) return 'unit';
      var figs=txt.filter(function(x){ return x && FIG.test(x); }).length;
      if(cnt('num')+cnt('calc')+cnt('empty')>=k.length*0.6 || (filled && figs>=Math.max(1,filled*0.4))) return /\$|\d{1,3},\d{3}/.test(txt.join(' '))?'amount':'rate';
      var maxLen=Math.max.apply(null,txt.map(function(x){ return x.length; }).concat([0]));
      return (maxLen>40 && txt.some(function(x){ return /\s/.test(x) && x.length>40; }))?'note':'short';
    });
    var labelMax=Math.max.apply(null,body.map(function(r){ return own(r.cells[0]).length; }).concat([0]));
    var fam=isPeriod?'period':roles.indexOf('note')>=0?'kvn':(labelMax<=12 && roles.slice(1).every(function(r){ return r==='amount'||r==='rate'; }))?'ledger':'kv';
    return {fam:fam,hs:hs,body:body,roles:roles};
  }
  function measure(o,r,i){
    var m=Math.max.apply(null,t(o.hs[i]).split(/\s+/).map(function(w){ return tw(o.hs[i],w); }))+22;
    o.body.forEach(function(row){ var c=row.cells[i];
      if(r==='choice'){ var sl=c.querySelector('select'), so=sl&&sl.options[sl.selectedIndex]; if(so) m=Math.max(m,tw(sl,so.text)+48); }   /* sized by the choice shown; choosing another re-renders and re-measures */
      else if(r==='input'){ var ip=c.querySelector('input'), sf=c.querySelector('.bk-sfx'), pw=ip&&/width:\s*(\d+)px/.exec(ip.getAttribute('data-bk-pw')||''), base=ip?Math.max(tw(ip,ip.value||ip.placeholder||''),40,pw?+pw[1]-30:0):tw(c,own(c)); m=Math.max(m,base+30+(sf?tw(sf,sf.textContent)+12:0)); }
      else if(r==='status'){ var ch=c.querySelector('.status-chip'); m=Math.max(m,ch?Math.max(tw(ch,t(ch))+44,ch.getBoundingClientRect().width+18):tw(c,own(c))+22); }   /* the label as drawn (letter spacing, marker, padding), not an estimate */
      else if(r==='amount'||r==='rate'||r==='period'){ var x=own(c), chp=c.querySelector('.status-chip'); if(chp) m=Math.max(m,tw(chp,t(chp))+44,chp.getBoundingClientRect().width+18); else if(/^(num|calc|empty)/.test(c.getAttribute('data-bk-kind')||'')||FIG.test(x)) m=Math.max(m,tw(c,x)+24); }
      else m=Math.max(m,tw(c,own(c))+22); });
    /* no column is narrower than its longest unbreakable word (an identifier, a long figure): text may wrap between words, never inside one */
    var word=0; o.body.concat([{cells:o.hs}]).forEach(function(row){ var c=row.cells[i]; if(!c || c.querySelector('select,input')) return; own(c).split(/\s+/).forEach(function(wd){ if(wd.length>1) word=Math.max(word,tw(c,wd)); }); });
    var res=Math.max(Math.ceil(word+24),Math.min(CEIL[r],Math.max(FLOOR[r],Math.ceil(m)))), full=Math.ceil(tw(o.hs[i],t(o.hs[i]))+22);
    if(full>res && full<=res*1.45) res=Math.min(CEIL[r],full);   /* a header stays on one line when that costs little; a long header wraps instead of widening its column */
    return res;
  }
  function labelNat(o){ return Math.max.apply(null,o.body.map(function(r){ return tw(r.cells[0],own(r.cells[0])); }).concat([40]))+26; }
  function standard(vp){
    var desk=window.innerWidth>760, groups=[];
    vp.querySelectorAll('table.fin').forEach(function(tb){ if(!inScope(tb)) return; var o=classify(tb); if(!o) return; o.tb=tb;
      set(tb,'data-bk-fam',o.fam); o.hs.forEach(function(h,i){ var r=o.roles?o.roles[i]:o.fam; set(h,'data-bk-role',r); });
      if(o.roles) o.body.forEach(function(row){ [].forEach.call(row.cells,function(c,i){ set(c,'data-bk-role',o.roles[i]); }); });
      var g=tb.closest('.main-col, .side-col')||tb.closest('.sheet-frame')||vp; var e=groups.filter(function(x){ return x.el===g; })[0]; if(!e){ e={el:g,list:[]}; groups.push(e); } e.list.push(o); });
    if(!desk) return;
    groups.forEach(function(G){
      var need={}, lab={kvn:0,period:0,ledger:0};
      G.list.forEach(function(o){ if(!o.roles) return; o.roles.forEach(function(r,i){ if(r==='label'||r==='note'||r==='short') return; need[r]=Math.max(need[r]||0,measure(o,r,i)); });
        o.short={}; o.roles.forEach(function(r,i){ if(r==='short') o.short[i]=measure(o,r,i); });
        if(o.fam==='kvn') lab.kvn=Math.max(lab.kvn,labelNat(o)); });
      /* short text columns share one width in the section too, like every other role, so stacked tables keep their columns in line */
      var shortMax=0; G.list.forEach(function(o){ if(o.short) Object.keys(o.short).forEach(function(i){ shortMax=Math.max(shortMax,o.short[i]); }); });
      G.list.forEach(function(o){ if(!o.roles) return; /* the space available is the container's, never the table's own width (which the guard below may have widened): otherwise the guard would undo itself on the next pass */
        var box=o.tb.parentNode, bcs=getComputedStyle(box), W=box.clientWidth-(parseFloat(bcs.paddingLeft)||0)-(parseFloat(bcs.paddingRight)||0); if(!(W>0)) W=o.tb.getBoundingClientRect().width;
        var fixed=0, nNotes=0, w=o.roles.map(function(r,i){ if(r==='label'||r==='note') { if(r==='note') nNotes++; return null; }
          if(o.fam==='ledger' && (r==='amount'||r==='rate')) return null; if(o.fam==='period' && r==='period') return null;
          var v=r==='short'?Math.min(shortMax,W*0.5):need[r]; fixed+=v; return v; });
        var lw=o.fam==='kv'?null:o.fam==='kvn'?Math.min(W*0.36,Math.max(W*0.2,lab.kvn)):Math.min(300,Math.max(60,labelNat(o)));
        var tmin='';
        if(o.fam==='kvn'){ var room=W-fixed-nNotes*160; if(lw>room) lw=Math.max(W*0.2,room); if(fixed+lw+nNotes*160>W) tmin=Math.ceil(fixed+lw+nNotes*160)+'px'; }
        if(o.fam==='period'){ var np=o.roles.filter(function(r){ return r==='period'; }).length, pm=need.period||FLOOR.period; if(lw+np*pm>W) tmin=Math.ceil(lw+np*pm)+'px'; }
        if(o.fam==='kv'){ var lmin=Math.min(labelNat(o),Math.max(W*0.24,140)); if(fixed+lmin>W) tmin=Math.ceil(fixed+lmin)+'px'; }   /* the label is never squeezed below its minimum: the table scrolls instead */
        if(o.fam==='ledger'){ var nf=0, fm=0; o.roles.forEach(function(r,i){ if(r==='amount'||r==='rate'){ nf++; fm=Math.max(fm,measure(o,r,i)); } }); if(lw+nf*fm>W) tmin=Math.ceil(lw+nf*fm)+'px'; }   /* figures never squeezed below their widest value: the ledger scrolls instead */
        w[0]=lw; o.w=w; o.tmin=tmin; o.W=W; });
      /* tables in one section with the same column structure (label, value, text, status in the same order) share one grid, whatever kind of value each
         holds: each column takes the widest of them; a text column that flexes in one flexes in all, and their labels share one measured width */
      var CLS={amount:'v',rate:'v',input:'v',choice:'v',period:'v',unit:'t',status:'s',short:'t',note:'t',label:'l'}, sigs={};
      G.list.forEach(function(o){ if(!o.roles || o.fam==='period' || o.fam==='ledger') return; var k=o.roles.map(function(r){ return CLS[r]; }).join(''); (sigs[k]=sigs[k]||[]).push(o); });
      Object.keys(sigs).forEach(function(k){ var L=sigs[k]; if(L.length<2) return; var n=L[0].roles.length, flexText={}, mx=[], anyNote=false;
        for(var i=1;i<n;i++){ L.forEach(function(o){ if(o.roles[i]==='note') flexText[i]=true; }); if(flexText[i]) anyNote=true; mx[i]=Math.max.apply(null,L.map(function(o){ return o.w[i]==null?0:o.w[i]; })); }
        var lw=anyNote?Math.min(Math.min.apply(null,L.map(function(o){ return o.W; }))*0.36, Math.max.apply(null,L.map(function(o){ return Math.max(o.W*0.2, lab.kvn||labelNat(o)); }))):null;
        L.forEach(function(o){ for(var i=1;i<n;i++) o.w[i]=flexText[i]?null:(mx[i]||null); o.w[0]=lw; }); });
      /* the crush guard, once every width is final: each column that takes spare width keeps a minimum (long text 160 px, short text 96, a label its own
         minimum); the label gives way first (down to 20% of the table), and if the columns still do not fit the table scrolls inside its card */
      G.list.forEach(function(o){ if(!o.roles || o.fam==='period' || o.fam==='ledger') return; var W=o.W, fixed=0, flexMin=0;
        o.roles.forEach(function(r,i){ if(i===0) return; if(o.w[i]==null) flexMin+=(r==='note'?160:r==='short'?96:(r==='amount'||r==='rate')?(need[r]||96):96); else fixed+=o.w[i]; });
        var lab0=o.w[0]==null?Math.min(labelNat(o),Math.max(W*0.24,140)):o.w[0];
        if(o.w[0]!=null && fixed+lab0+flexMin>W){ o.w[0]=Math.max(W*0.2,W-fixed-flexMin); lab0=o.w[0]; }
        o.tmin=(fixed+lab0+flexMin>W)?Math.ceil(fixed+lab0+flexMin)+'px':''; });
      G.list.forEach(function(o){ if(!o.roles) return; setStyle(o.tb,'--bk-tmin',o.tmin||'0px'); o.hs.forEach(function(h,i){ setStyle(h,'--bk-cw',o.w[i]==null?'auto':Math.round(o.w[i])+'px'); }); });
    });
  }
  /* a field with something beside it in its cell (a "$" before it, a note after it) takes the width that is left, so the pair never crosses the cell edge */
  function adorn(vp){ vp.querySelectorAll('table.fin td[data-bk-kind^="input"]').forEach(function(c){ var f=c.querySelector(':scope > input:not([type=checkbox]):not([type=radio]):not(.bk-sfx-in), :scope > select'); if(!f){ if(c.style.getPropertyValue('--bk-adorn')) c.style.removeProperty('--bk-adorn'); return; }
      var w=0; [].forEach.call(c.childNodes,function(n){ if(n===f) return; if(n.nodeType===1 && n.offsetWidth){ var cs=getComputedStyle(n); w+=n.getBoundingClientRect().width+(parseFloat(cs.marginLeft)||0)+(parseFloat(cs.marginRight)||0); } else if(n.nodeType===3 && n.textContent.trim()){ var r=document.createRange(); r.selectNodeContents(n); w+=r.getBoundingClientRect().width; } });
      setStyle(c,'--bk-adorn',w?Math.ceil(w+2)+'px':'0px'); }); }
  function tiers(vp){ vp.querySelectorAll('.status-chip').forEach(function(c){ set(c,'data-bk-tier',tierOf(c)); }); }
  var q=false; function schedule(){ if(q) return; q=true; requestAnimationFrame(function(){ q=false; try{ run(); var vp=document.getElementById('viewport'); if(vp){ tiers(vp); standard(vp); adorn(vp); } }catch(e){} }); }
  /* the table standard is applied in the same step as the render that changed the page, before it is painted, so a table never shows a frame in its
     unformatted layout (a re-render after an edit would otherwise shift the rows and move the page); the frame after runs it again once the other passes are done.
     Safe to run at once: it only writes attributes and style properties, which the viewport watcher (src/069, child lists only) does not observe. */
  function now(){ try{ run(); var vp=document.getElementById('viewport'); if(vp){ tiers(vp); standard(vp); adorn(vp); } }catch(e){} }
  if(typeof window.bkDisplayPass==='function') window.bkDisplayPass(function(){ now(); schedule(); });
  window.addEventListener('resize', schedule);
  window.bkCellTaggerRun=run; window.bkTableStandard=function(){ var vp=document.getElementById('viewport'); if(vp){ tiers(vp); standard(vp); adorn(vp); } };
})();
