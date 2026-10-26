
/* ===========================================================================
   INVESTOR ARCHITECTURE - SURFACES
   ===========================================================================
   Six pages, one model. Nothing here computes economics; every figure comes
   from bkInvestorLedger(), bkInvestorPortfolio() or bkSponsorEconomics().

     Investors          registry, commitments and effective terms
     Capital Calls      required versus funded, by call, with the shortfall
     Investor Schedules per-investor monthly distributions on their own terms
     Ledger (M)         the per-investor monthly ledger
     Investor Summary   portfolio-wide rollup across every saved deal
     Sponsor CF         the Sponsor Fee Income toggle, and project economics
                        shown separately and proven unmoved
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  if(n===null||n===undefined||n==='') return '-';
  var x=Number(n); if(!isFinite(x)) return '-';
  if(Object.is(x,-0)) x=0;
  var neg=x<0, a=Math.abs(x);
  var body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                   : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function money0(n){ var x=Number(n); return (!isFinite(x)||x===0) ? '-' : money(x); }
function pct(n){ var x=Number(n); if(!isFinite(x)) return '-'; return (x*100).toFixed(2)+'%'; }
function mult(n){ var x=Number(n); if(!isFinite(x)) return '-'; return x.toFixed(2)+'x'; }
function intf(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x).toLocaleString('en-US'); }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td class="rowlabel" data-bk-align="text" style="font-weight:400;opacity:.8">'+t+'</td>'; }
function wrapTable(caption, headHtml, bodyHtml){
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'
       + '<thead>'+headHtml+'</thead><tbody>'+bodyHtml+'</tbody></table></div>';
}
function extend(sheet, tag, fn){
  if(typeof RENDERERS[sheet] !== 'function') return false;
  var prev = RENDERERS[sheet];
  if(prev['__'+tag]) return true;
  var wrapped = function(){
    var o = prev.apply(this, arguments);
    // BLANK-SLATE GUARD: extension layers must never append calculations to a
    // canonical no-deal page. The base renderer is authoritative for empty state.
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    } catch(_blankStateErr){}
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
    if(!o || typeof o !== 'object') return o;
    if(/withheld|calculation blocked/i.test(String(o.main||''))) return o;
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','An investor block could not be rendered: '+esc(e.message)
        + '. The figures above are unaffected.');
    }
    return o;
  };
  wrapped['__'+tag] = true; wrapped.__bkOriginal = prev.__bkOriginal || prev;
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__')===0 && !wrapped[k]) wrapped[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}
function src(tag){
  return tag === 'deal' ? chip('', 'deal override')
       : tag === 'registry' ? chip('', 'registry')
       : '<span style="opacity:.55">class default</span>';
}

/* =====================================================================
   INVESTORS - registry, commitments, effective terms
   ===================================================================== */
extend('Investors','invRegistry', function(o){
  var reg = bkInvestorRegistryLoad();
  var s = bkLoad();
  var commits = bkDealCommitments(s);
  var led = null; try { led = bkInvestorLedger(); } catch(e){}

  // ---- the global registry ----
  var regBody = reg.length ? reg.map(function(r){
    return '<tr>'
      + '<td class="rowlabel input" data-bk-align="text" contenteditable="true" spellcheck="false"'
      +   ' onblur="bkInvestorRegistrySet(\''+esc(r.id)+'\',\'name\',this.textContent.trim());showSheet(currentSheet)">'+esc(r.name||'')+'</td>'
      + '<td class="v"><select onchange="bkInvestorRegistrySet(\''+esc(r.id)+'\',\'defaultClass\',this.value);showSheet(currentSheet)">'
      +   '<option'+(String(r.defaultClass)!=='GP'?' selected':'')+'>LP</option>'
      +   '<option'+(String(r.defaultClass)==='GP'?' selected':'')+'>GP</option></select></td>'
      + '<td class="v"><input type="number" step="0.01" style="width:84px" placeholder="deal"'
      +   ' value="'+(r.defaultPref!=null?(Number(r.defaultPref)*100).toFixed(2):'')+'"'
      +   ' onchange="bkInvRegPct(\''+esc(r.id)+'\',\'defaultPref\',this.value)"></td>'
      + '<td class="v"><input type="number" step="0.01" style="width:84px" placeholder="deal"'
      +   ' value="'+(r.defaultPromoteShare!=null?(Number(r.defaultPromoteShare)*100).toFixed(2):'')+'"'
      +   ' onchange="bkInvRegPct(\''+esc(r.id)+'\',\'defaultPromoteShare\',this.value)"></td>'
      + '<td class="v"><input type="number" step="0.01" style="width:84px"'
      +   ' value="'+(Number(r.defaultMgmtFeePct)*100||0).toFixed(2)+'"'
      +   ' onchange="bkInvRegPct(\''+esc(r.id)+'\',\'defaultMgmtFeePct\',this.value)"></td>'
      + '<td class="v"><button type="button" class="status-chip" onclick="bkInvestorRegistryRemove(\''+esc(r.id)+'\');showSheet(currentSheet)">Remove</button></td>'
      + '</tr>';
  }).join('')
   : '<tr><td class="rowlabel" data-bk-align="text" colspan="6">No investors in the registry yet. '
     + 'Add one here and it becomes available to every deal.</td></tr>';

  var registry = wrapTable('Global Investor Registry - defined once, available to every deal',
    '<tr><th class="rowlabel-h">Investor</th><th>Default Class</th><th>Default Pref %</th>'
    + '<th>Default Promote %</th><th>Mgmt Fee % p.a.</th><th>Action</th></tr>', regBody)
    + '<div style="margin-top:12px"><button type="button" class="status-chip pass" onclick="bkInvestorRegistryAdd({});showSheet(currentSheet)">+ Add Investor to Registry</button></div>';

  // ---- commitments on THIS deal ----
  /* V30.2: only a deal that still carries an unmigrated legacy list is "legacy" - an empty deal is not. */
  var isLegacy = (!Array.isArray(s.commitments) || !s.commitments.length) && Array.isArray(s.investors) && s.investors.length > 0;
  var cBody = commits.length ? commits.map(function(c, i){
    var t = bkInvestorTerms(c, s);
    var funded = bkCommitmentFunded(c), required = bkCommitmentRequired(c);
    var commitment = Number(c.commitment) || 0;
    var unfunded = Math.max(0, commitment - funded);
    var opts = bkInvestorRegistryLoad().map(function(r){
      return '<option value="'+esc(r.id)+'"'+(r.id===c.investorId?' selected':'')+'>'+esc(r.name)+'</option>'; }).join('');
    if(!t.registered) opts = '<option selected>'+esc(t.name)+' (not in registry)</option>' + opts;
    return '<tr>'
      + '<td class="rowlabel" data-bk-align="text">'
      +   (isLegacy ? esc(t.name)
                    : '<select onchange="bkCommitSet('+i+',\'investorId\',this.value)">'+opts+'</select>')+'</td>'
      + '<td class="v">'+esc(t.cls)+' '+src(t.src.cls)+'</td>'
      + (isLegacy ? val(money(commitment))
                  : '<td class="v"><input type="number" step="1000" style="width:120px" value="'+Math.round(commitment)+'"'
                    + ' onchange="bkCommitSet('+i+',\'commitment\',this.value)"></td>')
      + val(money(funded)) + val(money0(unfunded))
      + val(commitment>0 ? pct(funded/commitment) : '-')
      + '<td class="v">'+chip(unfunded<=1?'pass':'warn', unfunded<=1?'FULLY FUNDED':'OUTSTANDING')+'</td>'
      + (isLegacy ? '<td class="v">-</td>'
                  : '<td class="v"><button type="button" class="status-chip" onclick="bkCommitRemove('+i+')">Remove</button></td>')
      + '</tr>';
  }).join('')
   : '<tr><td class="rowlabel" data-bk-align="text" colspan="8">No investors on this deal yet.</td></tr>';

  var totCommit = commits.reduce(function(a,c){ return a + (Number(c.commitment)||0); }, 0);
  var totFunded = commits.reduce(function(a,c){ return a + bkCommitmentFunded(c); }, 0);
  var dealEquity = led ? led.dealEquity : 0;
  var gap = totFunded - dealEquity;
  cBody += '<tr class="grandtotal">'+lbl('TOTAL')+val('-')+val(money(totCommit))+val(money(totFunded))
        + val(money0(Math.max(0, totCommit-totFunded)))
        + val(totCommit>0?pct(totFunded/totCommit):'-')
        + '<td class="v">'+chip(Math.abs(gap)<=1?'pass':'warn', Math.abs(gap)<=1?'FUNDS THE DEAL':'CHECK AGAINST EQUITY')+'</td>'
        + '<td class="v">-</td></tr>';

  var commitTable = wrapTable('Commitments on This Deal'+(isLegacy?' - read from the legacy investor list':''),
    '<tr><th class="rowlabel-h">Investor</th><th>Class</th><th>Commitment</th><th>Funded to Date</th>'
    + '<th>Unfunded</th><th>% Funded</th><th>Status</th><th>Action</th></tr>', cBody)
    + '<div style="margin-top:12px"><button type="button" class="status-chip pass" onclick="bkCommitAdd()">+ Add Commitment</button>'
    + (isLegacy ? ' <span style="opacity:.7;font-size:.9em">&nbsp;adding one converts this deal&rsquo;s legacy list into commitments, keeping the same amounts</span>' : '')
    + '</div>';

  // ---- effective terms, with provenance ----
  var termsTable = '';
  if(commits.length){
    termsTable = wrapTable('Effective Terms - registry default, then per-deal override',
      '<tr><th class="rowlabel-h">Investor</th><th>Preferred Return</th><th>Source</th><th>Promote to GP</th>'
      + '<th>Source</th><th>Mgmt Fee p.a.</th><th>Catch-Up</th></tr>',
      commits.map(function(c, i){
        var t = bkInvestorTerms(c, s);
        var dealPromote = 1 - (Number(s.t2LP)||0);
        return '<tr>'+lbl(esc(t.name))
          + (isLegacy ? val(pct(t.pref))
             : '<td class="v"><input type="number" step="0.01" style="width:84px" placeholder="'+((Number(s.pref)||0)*100).toFixed(2)+'"'
               + ' value="'+(c.prefOverride!=null&&c.prefOverride!==''?(Number(c.prefOverride)*100).toFixed(2):'')+'"'
               + ' onchange="bkCommitSet('+i+',\'prefOverride\',this.value)"></td>')
          + '<td class="v">'+src(t.src.pref)+' &rarr; '+pct(t.pref)+'</td>'
          + (isLegacy ? val(pct(dealPromote))
             : '<td class="v"><input type="number" step="0.01" style="width:84px" placeholder="'+(dealPromote*100).toFixed(2)+'"'
               + ' value="'+(c.promoteShareOverride!=null&&c.promoteShareOverride!==''?(Number(c.promoteShareOverride)*100).toFixed(2):'')+'"'
               + ' onchange="bkCommitSet('+i+',\'promoteShareOverride\',this.value)"></td>')
          + '<td class="v">'+src(t.src.promote)+' &rarr; '+pct(t.promoteShare!=null?t.promoteShare:dealPromote)+'</td>'
          + (isLegacy ? val(pct(t.mgmtFeePct))
             : '<td class="v"><input type="number" step="0.01" style="width:84px" value="'+(t.mgmtFeePct*100).toFixed(2)+'"'
               + ' onchange="bkCommitSet('+i+',\'mgmtFeeOverride\',this.value)"></td>')
          + '<td class="v">'+(t.catchup===null ? ('deal &rarr; '+(Number(s.gpCatchup)?'On':'Off')) : (t.catchup?'On':'Off'))+'</td>'
          + '</tr>';
      }).join(''));
  }

  o.main = (o.main||'') + registry + commitTable + termsTable
    + note('&#9432;','<b>Two layers, one answer.</b> The registry holds each investor once, so the same investor in three deals is '
      + 'the same investor in the portfolio rollup. A deal can override any term locally, and the Source column says which layer each '
      + 'effective term came from - a blank input means &ldquo;follow the deal&rdquo;, not zero. '
      + '<b>Distributions are allocated on funded capital, not on commitment</b>: an unfunded commitment is an obligation, and it earns '
      + 'nothing until it is funded.');
});

window.bkInvRegPct = function(id, key, v){
  var n = Number(String(v).replace(/[%,]/g,''));
  bkInvestorRegistrySet(id, key, (v === '' || !isFinite(n)) ? null : n/100);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Investors');
};

/* =====================================================================
   CAPITAL CALLS - required versus funded
   ===================================================================== */
extend('Capital Calls','invCalls', function(o){
  var s = bkLoad(), commits = bkDealCommitments(s);
  if(!commits.length){
    o.main = (o.main||'') + note('&#9432;','<b>No investors on this deal yet.</b> Add commitments on the Investors page and the '
      + 'call schedule appears here, tracking what has been called against what has actually been funded.');
    return;
  }
  /* V30.2: only a deal that still carries an unmigrated legacy list is "legacy" - an empty deal is not. */
  var isLegacy = (!Array.isArray(s.commitments) || !s.commitments.length) && Array.isArray(s.investors) && s.investors.length > 0;
  var blocks = commits.map(function(c, i){
    var t = bkInvestorTerms(c, s);
    var calls = c.calls || [];
    var body = calls.map(function(k, ci){
      var req = Number(k.required)||0, fun = Number(k.funded)||0, short = req - fun;
      return '<tr>'+lbl('Call '+(ci+1))
        + (isLegacy ? val(esc(k.date||'-'))
           : '<td class="v"><input type="date" style="width:150px" value="'+esc(k.date||'')+'"'
             + ' onchange="bkCallSet('+i+','+ci+',\'date\',this.value)"></td>')
        + (isLegacy ? val(money(req))
           : '<td class="v"><input type="number" step="1000" style="width:120px" value="'+Math.round(req)+'"'
             + ' onchange="bkCallSet('+i+','+ci+',\'required\',this.value)"></td>')
        + (isLegacy ? val(money(fun))
           : '<td class="v"><input type="number" step="1000" style="width:120px" value="'+Math.round(fun)+'"'
             + ' onchange="bkCallSet('+i+','+ci+',\'funded\',this.value)"></td>')
        + val(money0(short))
        + '<td class="v">'+chip(Math.abs(short)<=1?'pass':(fun>0?'warn':''), Math.abs(short)<=1?'FUNDED':(fun>0?'PARTIAL':'OUTSTANDING'))+'</td>'
        + (isLegacy ? '<td class="v">-</td>'
           : '<td class="v"><button type="button" class="status-chip" onclick="bkCallRemove('+i+','+ci+')">Remove</button></td>')
        + '</tr>';
    }).join('');
    var req = bkCommitmentRequired(c), fun = bkCommitmentFunded(c), commitment = Number(c.commitment)||0;
    body += '<tr class="grandtotal">'+lbl('TOTAL CALLED')+val('-')+val(money(req))+val(money(fun))
          + val(money0(req-fun))
          + '<td class="v">'+chip(Math.abs(req-fun)<=1?'pass':'warn', Math.abs(req-fun)<=1?'ALL FUNDED':'SHORTFALL')+'</td>'
          + '<td class="v">-</td></tr>'
          + '<tr>'+lbl('Uncalled Commitment')+val('-')+val(money0(Math.max(0, commitment-req)))+val('-')+val('-')
          + '<td class="v">'+chip('', Math.max(0, commitment-req)>1 ? 'AVAILABLE TO CALL' : 'FULLY CALLED')+'</td>'
          + '<td class="v">-</td></tr>';
    return wrapTable(esc(t.name)+' - '+esc(t.cls)+', committed '+money(commitment),
      '<tr><th class="rowlabel-h">Call</th><th>Date</th><th>Required</th><th>Funded</th><th>Shortfall</th>'
      + '<th>Status</th><th>Action</th></tr>', body)
      + (isLegacy ? '' : '<div style="margin-top:8px"><button type="button" class="status-chip" onclick="bkCallAdd('+i+')">+ Add Call</button> '
          + '<button type="button" class="status-chip pass" onclick="bkCallFundAll('+i+')">Mark All Funded</button></div>');
  }).join('');

  var totC = commits.reduce(function(a,c){ return a + (Number(c.commitment)||0); }, 0);
  var totR = commits.reduce(function(a,c){ return a + bkCommitmentRequired(c); }, 0);
  var totF = commits.reduce(function(a,c){ return a + bkCommitmentFunded(c); }, 0);
  var summary = wrapTable('Capital Call Summary - this deal',
    '<tr><th class="rowlabel-h">Measure</th><th>Amount</th><th style="text-align:left">Basis</th><th>Status</th></tr>',
      '<tr>'+lbl('Total Committed')+val(money(totC))+txt('Across every investor on this deal')+'<td></td></tr>'
    + '<tr>'+lbl('Total Called')+val(money(totR))+txt('Sum of every call issued')+'<td></td></tr>'
    + '<tr>'+lbl('Total Funded')+val(money(totF))+txt('What has actually arrived - this is what earns distributions')
      + '<td class="v">'+chip('pass','ALLOCATION BASIS')+'</td></tr>'
    + '<tr>'+lbl('Called but Not Funded')+val(money0(totR-totF))+txt('Outstanding against issued calls')
      + '<td class="v">'+chip(Math.abs(totR-totF)<=1?'pass':'warn', Math.abs(totR-totF)<=1?'NONE':'SHORTFALL')+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('UNCALLED COMMITMENT')+val(money0(Math.max(0,totC-totR)))
      + txt('Dry powder still available to call on this deal')
      + '<td class="v">'+chip('', Math.max(0,totC-totR)>1?'AVAILABLE':'FULLY CALLED')+'</td></tr>');

  o.main = (o.main||'') + summary + blocks
    + note('&#9432;','<b>Funded actual is the allocation basis.</b> An investor who has committed $5m and funded $3m is allocated on '
      + '$3m; the remaining $2m appears as uncalled commitment and earns nothing until it arrives. The distinction matters most in a '
      + 'deal that is still calling capital, which is exactly when a commitment-based split would overstate an investor&rsquo;s return.');
});

/* =====================================================================
   INVESTOR SCHEDULES - per-investor monthly, on individual terms
   ===================================================================== */
extend('Investor Schedules','invSchedules', function(o){
  var led = null; try { led = bkInvestorLedger(); } catch(e){}
  if(!led || !led.investors.length) return;
  var s = bkLoad();

  var roster = wrapTable('Per-Investor Economics - each on their own terms',
    '<tr><th class="rowlabel-h">Investor</th><th>Class</th><th>Committed</th><th>Funded</th><th>Share of Funded</th>'
    + '<th>Pref</th><th>Promote</th><th>Distributions</th><th>Mgmt Fee</th><th>XIRR</th><th>MOIC</th></tr>',
    led.investors.map(function(x){
      var dealPromote = 1 - (Number(s.t2LP)||0);
      return '<tr>'+lbl(esc(x.terms.name))+val(esc(x.terms.cls))
        + val(money(x.commitment)) + val(money(x.funded)) + val(pct(x.share))
        + val(pct(x.terms.pref)) + val(pct(x.terms.promoteShare!=null?x.terms.promoteShare:dealPromote))
        + val(money(x.totDist)) + val(money0(x.totFee))
        + val(isFinite(x.xirr)?pct(x.xirr):'-') + val(mult(x.moic))+'</tr>';
    }).join('')
    + (function(){
        var c = led.conservation;
        return '<tr class="grandtotal">'+lbl('TOTAL / TO GP')
          + val('-') + val(money(led.committed)) + val(money(led.funded)) + val('100.00%')
          + val('-') + val('-')
          + val(money(c.investorDist)) + val(money(led.investors.reduce(function(a,x){return a+x.totFee;},0)))
          + val('-') + val('-') + '</tr>';
      })());

  // CONSERVATION, computed and shown rather than claimed
  var c = led.conservation;
  var okD = Math.abs(c.distVariance) < 1, okC = Math.abs(c.conVariance) < 1, okE = Math.abs(c.fundedVsEquity) < 1;
  var conserve = wrapTable('Allocation Conservation - the slices must add back to the deal',
    '<tr><th class="rowlabel-h">Check</th><th>Investors</th><th>To GP</th><th>Deal Total</th><th>Variance</th><th>Status</th></tr>',
      '<tr>'+lbl('Distributions')+val(money(c.investorDist))+val(money(c.gpDist))+val(money(c.dealDist))
        + val(money(c.distVariance))+'<td class="v">'+chip(okD?'pass':'fail', okD?'TIES':'BREAK')+'</td></tr>'
    + '<tr>'+lbl('Contributions')+val(money(c.investorCon))+val('-')+val(money(c.dealCon))
        + val(money(c.conVariance))+'<td class="v">'+chip(okC?'pass':'fail', okC?'TIES':'BREAK')+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('FUNDED CAPITAL vs DEAL EQUITY')+val(money(led.funded))+val('-')
        + val(money(led.dealEquity))+val(money(c.fundedVsEquity))
        + '<td class="v">'+chip(okE?'pass':'warn', okE?'FUNDS THE DEAL':'REVIEW')+'</td></tr>');

  var blocks = led.investors.map(function(x){
    var head = '<tr><th class="rowlabel-h">Mo</th><th>Contribution</th><th>Distribution (gross)</th>'
             + '<th>Mgmt Fee</th><th>Distribution (net)</th><th>Net Cash Flow</th><th>Unreturned Capital</th></tr>';
    var body = x.months.filter(function(m){ return m.con || m.distGross; }).map(function(m){
      return '<tr>'+lbl(String(m.m))+val(money0(m.con))+val(money0(m.distGross))+val(money0(m.mgmtFee))
        + val(money0(m.dist))+val(money(m.net))+val(money(m.unreturned))+'</tr>';
    }).join('');
    var tot = '<tr class="grandtotal">'+lbl('TOTAL')+val(money(x.totCon))+val(money(x.totDist+x.totFee))
            + val(money0(x.totFee))+val(money(x.totDist))+val(money(x.totDist-x.totCon))+val('-')+'</tr>';
    return wrapTable(esc(x.terms.name)+' - monthly, on '+pct(x.terms.pref)+' pref'
                     + (x.terms.mgmtFeePct ? ' and a '+pct(x.terms.mgmtFeePct)+' management fee' : '')
                     + ' &middot; XIRR '+(isFinite(x.xirr)?pct(x.xirr):'n/a')+' &middot; MOIC '+mult(x.moic),
                     head, body + tot);
  }).join('');

  o.main = (o.main||'') + roster + conserve + blocks
    + note('&#9432;','<b>Each investor&rsquo;s slice runs through the same waterfall engine the deal does</b>, carrying that '
      + 'investor&rsquo;s own preferred return and promote. The slices partition the deal&rsquo;s own monthly stream by funded capital, '
      + 'so the conservation table above is a real check and not a formality: if individual terms ever stopped adding back to the deal, '
      + 'it would read BREAK. The management fee accrues monthly on funded capital, is paid out of that investor&rsquo;s distributions '
      + 'when there are any, carries in arrears when there are not, and is credited to the GP.');
});

/* =====================================================================
   LEDGER (M) - per-investor monthly ledger
   ===================================================================== */
extend('Ledger (M)','invLedger', function(o){
  var led = null; try { led = bkInvestorLedger(); } catch(e){}
  if(!led || !led.investors.length) return;
  var entries = [];
  led.investors.forEach(function(x){
    x.months.forEach(function(m){
      if(m.con)      entries.push({m:m.m, who:x.terms.name, item:'Capital Contribution', amt:-m.con});
      if(m.distGross)entries.push({m:m.m, who:x.terms.name, item:'Distribution', amt:m.distGross});
      if(m.mgmtFee)  entries.push({m:m.m, who:x.terms.name, item:'Management Fee', amt:-m.mgmtFee});
    });
  });
  entries.sort(function(a,b){ return a.m - b.m || String(a.who).localeCompare(String(b.who)); });
  if(!entries.length) return;
  var body = entries.map(function(e){
    return '<tr>'+lbl(String(e.m))+'<td class="rowlabel" data-bk-align="text">'+esc(e.who)+'</td>'
      + '<td class="rowlabel" data-bk-align="text">'+esc(e.item)+'</td>'+val(money(e.amt))+'</tr>';
  }).join('');
  o.main = (o.main||'') + wrapTable('Per-Investor Ledger - every investor movement, '+intf(entries.length)+' entries',
    '<tr><th class="rowlabel-h">Mo</th><th style="text-align:left">Investor</th>'
    + '<th style="text-align:left">Line Item</th><th>Amount</th></tr>', body)
    + note('&#9432;','The deal-level ledger above is unchanged. This is the same period, resolved to the individual investor - '
      + 'the dimension the workbook&rsquo;s per-slot ledger had and this application did not.');
});

/* =====================================================================
   INVESTOR SUMMARY - portfolio-wide rollup
   ===================================================================== */
extend('Investor Summary','invRollup', function(o){
  var roll = null; try { roll = bkInvestorPortfolio(); } catch(e){}
  if(!roll){ return; }
  if(!roll.investors.length){
    o.main = (o.main||'') + note('&#9432;','<b>No investor commitments across the saved portfolio yet.</b> Add investors to the '
      + 'registry and commit them to deals, and each investor&rsquo;s position across every deal rolls up here on one calendar.');
    return;
  }
  var body = roll.investors.map(function(e){
    return '<tr>'+lbl(esc(e.name))+val(esc(e.cls))+val(intf(e.deals.length))
      + val(money(e.committed)) + val(money(e.funded)) + val(money0(e.unfunded))
      + val(money(e.dist)) + val(money0(e.unreturned))
      + val(isFinite(e.xirr)?pct(e.xirr):'-') + val(mult(e.moic))
      + '<td class="v">'+chip(e.registered?'pass':'warn', e.registered?'REGISTERED':'DEAL-ONLY')+'</td></tr>';
  }).join('');
  var tC = roll.investors.reduce(function(a,e){ return a+e.committed; }, 0);
  var tF = roll.investors.reduce(function(a,e){ return a+e.funded; }, 0);
  var tD = roll.investors.reduce(function(a,e){ return a+e.dist; }, 0);
  body += '<tr class="grandtotal">'+lbl('ALL INVESTORS')+val('-')+val(intf(roll.deals))
        + val(money(tC))+val(money(tF))+val(money0(tC-tF))+val(money(tD))
        + val(money0(Math.max(0,tF-tD)))+val('-')+val(tF>0?mult(tD/tF):'-')+'<td class="v">-</td></tr>';

  var perDeal = roll.investors.map(function(e){
    return wrapTable(esc(e.name)+' - position by deal',
      '<tr><th class="rowlabel-h">Deal</th><th>Commitment</th><th>Funded</th><th>Distributions</th><th>XIRR</th><th>MOIC</th></tr>',
      e.deals.map(function(d){
        return '<tr>'+lbl(esc(d.deal))+val(money(d.commitment))+val(money(d.funded))+val(money(d.dist))
          + val(isFinite(d.xirr)?pct(d.xirr):'-')+val(mult(d.moic))+'</tr>';
      }).join('')
      + '<tr class="grandtotal">'+lbl('ACROSS '+intf(e.deals.length)+' DEAL(S)')+val(money(e.committed))
        + val(money(e.funded))+val(money(e.dist))
        + val(isFinite(e.xirr)?pct(e.xirr):'-')+val(mult(e.moic))+'</tr>');
  }).join('');

  o.main = (o.main||'') + wrapTable('Portfolio-Wide Investor Rollup - across '+intf(roll.deals)+' saved deal(s)',
    '<tr><th class="rowlabel-h">Investor</th><th>Class</th><th>Deals</th><th>Committed</th><th>Funded</th>'
    + '<th>Unfunded</th><th>Distributions</th><th>Unreturned</th><th>XIRR</th><th>MOIC</th><th>Registry</th></tr>', body)
    + perDeal
    + note('&#9432;','<b>The same investor across deals is one investor here</b>, because the registry gives them a stable id rather '
      + 'than matching on a name that can be typed two ways. Each investor&rsquo;s XIRR is computed on their combined dated cash flows '
      + 'across every deal, not averaged from per-deal returns. An investor marked DEAL-ONLY exists on a deal but not in the registry, '
      + 'so they cannot be rolled up with the same investor elsewhere - add them to the registry to link the positions.');
});

/* =====================================================================
   SPONSOR CF - the fee income toggle, and project economics held apart
   ===================================================================== */
extend('Sponsor CF','invSponsorToggle', function(o){
  var s = bkLoad(), e = null;
  try { e = bkSponsorEconomics(); } catch(err){}
  if(!e) return;
  var fees = { devFee: e.devFee, cmFee: e.cmFee, hasDev: e.hasDev };

  var controls = wrapTable('Sponsor Fee Income - what counts as sponsor revenue',
    '<tr><th class="rowlabel-h">Setting</th><th>Value</th><th style="text-align:left">Covers</th><th>Status</th></tr>',
      '<tr>'+lbl('Sponsor Fee Income Included')
      + '<td class="v"><select onchange="bkSetSponsorFeeIncome(this.value)">'
      +   '<option'+(e.includeOps?' selected':'')+'>Included</option>'
      +   '<option'+(!e.includeOps?' selected':'')+'>Excluded</option></select></td>'
      + txt('Acquisition, asset management and disposition fees')
      + '<td class="v">'+chip(e.includeOps?'pass':'', e.includeOps?'IN SPONSOR CF':'EXCLUDED')+'</td></tr>'
    + '<tr>'+lbl('Development &amp; CM Fee as Sponsor Income')
      + '<td class="v"><select onchange="bkSetSponsorDevFeeIncome(this.value)"'+(fees.hasDev?'':' disabled')+'>'
      +   '<option'+(!e.includeDev?' selected':'')+'>Excluded</option>'
      +   '<option'+(e.includeDev?' selected':'')+'>Included</option></select></td>'
      + txt(fees.hasDev ? 'Development fee and construction management fee, earned as the costs they are charged on are drawn'
                        : 'Development deals only - this deal has no construction budget')
      + '<td class="v">'+chip(e.includeDev?'pass':'', fees.hasDev ? (e.includeDev?'IN SPONSOR CF':'CAPITALISED ONLY') : 'NOT APPLICABLE')+'</td></tr>');

  // PROJECT ECONOMICS - held apart, and proven unmoved
  var proj = null, c = null;
  try { c = bkCalc(); } catch(err){}
  try { proj = (typeof bkDevV09 === 'function') ? bkDevV09() : null; } catch(err){}
  // See the defect note in the Reverse Solve block: bkDevV09() carries `levered`
  // and `unlev`, never `totalCost`.
  var devCost = null, devUnlev = null;
  if(proj && proj.isDev){
    var uv = Number(proj.unlev);
    devUnlev = (isFinite(uv) && uv > 0) ? uv : null;
    try { if(typeof bkDevFundingV10 === 'function'){ var fnd = bkDevFundingV10();
            if(fnd && fnd.isDev && isFinite(Number(fnd.levered)) && Number(fnd.levered) > 0) devCost = Number(fnd.levered); } } catch(err){}
    if(devCost === null) devCost = devUnlev;
  }
  var basis = (devCost !== null) ? devCost
            : (Number(s.purchasePrice)||0) * (1 + (Number(s.closingCostsPct)||0) + (Number(s.acqFeePct)||0));
  var noi = c ? (Number(c.noi)||0) : 0;
  var x = null; try { x = bkMonthlyReturns(); } catch(err){}

  var project = wrapTable('Project Economics - unaffected by the toggle above',
    '<tr><th class="rowlabel-h">Measure</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr>',
      (devUnlev !== null
        ? '<tr>'+lbl('Development Cost - before financing')+val(money(devUnlev))
          + txt('Land, hard, soft and lease-up deficit. The development and CM fee are capitalised into this figure.')
          + '<td class="v">'+chip('pass','FIXED')+'</td></tr>'
        : '')
    + '<tr>'+lbl(proj&&proj.isDev?'Total Development Cost - all-in':'All-In Acquisition Basis')+val(money(basis))
        + txt(proj&&proj.isDev
              ? 'Plus capitalised interest and loan fees. This is the yield-on-cost basis, and it is the same in EVERY toggle state.'
              : 'Purchase price plus closing costs and the acquisition fee')
        + '<td class="v">'+chip('pass','FIXED')+'</td></tr>'
    + '<tr>'+lbl('Year-1 Net Operating Income')+val(money(noi))+txt('Property operations')
        + '<td class="v">'+chip('pass','FIXED')+'</td></tr>'
    + '<tr>'+lbl('Yield on Cost')+val(basis>0?pct(noi/basis):'-')+txt('NOI &divide; basis')
        + '<td class="v">'+chip('pass','FIXED')+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('PROJECT LEVERED XIRR')+val(x&&isFinite(x.irr)?pct(x.irr):'-')
        + txt('The deal&rsquo;s own return, before any sponsor fee recognition')
        + '<td class="v">'+chip('pass','FIXED')+'</td></tr>');

  var sponsor = wrapTable('Sponsor Economics - on the current setting',
    '<tr><th class="rowlabel-h">Component</th><th>Amount</th><th style="text-align:left">Basis</th><th>Status</th></tr>',
      '<tr>'+lbl('GP Co-Investment Contributed')+val(money(-Math.abs(e.gpContrib)))+txt('Sponsor capital into the deal')+'<td></td></tr>'
    + '<tr>'+lbl('GP Distributions')+val(money(e.gpDist))+txt('Including promote')+'<td></td></tr>'
    + '<tr>'+lbl('&nbsp;&nbsp;of which Promote')+val(money(e.promote))+txt('Carried interest above the hurdles')+'<td></td></tr>'
    + '<tr>'+lbl('Operating Fee Income')+val(e.includeOps?money(e.opsFees):'-')
      + txt('Acquisition, asset management, disposition')
      + '<td class="v">'+chip(e.includeOps?'pass':'', e.includeOps?'INCLUDED':'EXCLUDED')+'</td></tr>'
    + '<tr>'+lbl('Development Fee')+val(fees.hasDev?money(fees.devFee):'-')
      + txt(fees.hasDev?'Charged on hard cost plus soft subtotal, capitalised into project cost':'Not a development deal')
      + '<td class="v">'+chip(e.includeDev?'pass':'', fees.hasDev?(e.includeDev?'RECOGNISED':'CAPITALISED ONLY'):'N/A')+'</td></tr>'
    + '<tr>'+lbl('Construction Management Fee')+val(fees.hasDev?money(fees.cmFee):'-')
      + txt(fees.hasDev?'Charged on hard cost, capitalised into project cost':'Not a development deal')
      + '<td class="v">'+chip(e.includeDev?'pass':'', fees.hasDev?(e.includeDev?'RECOGNISED':'CAPITALISED ONLY'):'N/A')+'</td></tr>'
    + '<tr>'+lbl('Total Fee Income Recognised')+val(money(e.totalFeeIncome))+txt('What the toggle lets through')
      + '<td class="v">'+chip('','SPONSOR SIDE')+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('SPONSOR ALL-IN XIRR')+val(isFinite(e.sponsorXIRR)?pct(e.sponsorXIRR):'-')
      + txt('Co-invest + promote + fee income')
      + '<td class="v">'+chip('pass','MOVES WITH THE TOGGLE')+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('SPONSOR MOIC')+val(mult(e.sponsorMOIC))+txt('On GP contributed capital')+'<td></td></tr>');

  o.main = (o.main||'') + controls + project + sponsor
    + note('&#9888;','<b>The fee is a project cost in every setting.</b> Turning on development and CM fee income does not take the fee '
      + 'out of the cost ladder - total development cost, yield on cost and the project return are identical whatever this is set '
      + 'to, which is what the FIXED chips above mean and what the regression asserts. What changes is only whether the sponsor '
      + 'recognises that fee as revenue on their own side. Recognising it is the workbook&rsquo;s treatment, where the fee is booked as '
      + 'income AND as cost; leaving it off is this engine&rsquo;s historical treatment, where it is capitalised and never appears as '
      + 'sponsor revenue. Both are defensible, they answer different questions, and neither is now happening silently.');
});

})();
