
/* ===========================================================================
   V30.0 - ONE INVESTOR SYSTEM
   Investor Registry (canonical identity, user_documents: investor_registry)
     -> deal commitments + capital calls (s.commitments, saved with the deal)
       -> Investor Schedules / Liquidity / Summary / export = bkInvestorLedger()

   The pre-registry per-deal list (s.investors: name / class / sharePct) is no
   longer editable anywhere. A deal that still carries it is migrated once, on
   load, into registry investors + commitments. The commitment sizing is the
   same function the registry model already used to read legacy lists
   (bkDealCommitments), so every investor figure is unchanged by migration.
   The original list is archived on the deal (s._legacyInvestorsArchive), never
   discarded. Ambiguities are surfaced, not guessed:
     * a legacy name matching MORE THAN ONE registry investor
     * the same name appearing twice in the legacy list
     * a class whose shares sum to more than 100%
   A deal with a conflict keeps its read-only legacy list until the user
   resolves it with an explicit button.
   =========================================================================== */
(function(){
'use strict';
function norm(n){ return String(n||'').replace(/\s+/g,' ').trim().toLowerCase(); }

function conflicts(s){
  var inv = Array.isArray(s.investors) ? s.investors : [];
  var reg = bkInvestorRegistryLoad(), out = [], seen = {};
  inv.forEach(function(x){
    var n = norm(x.name);
    if(!n){ out.push('An investor has no name.'); return; }
    if(seen[n]) out.push('"' + x.name + '" appears more than once in the legacy list.');
    seen[n] = true;
    var hits = reg.filter(function(r){ return norm(r.name) === n; });
    if(hits.length > 1) out.push('"' + x.name + '" matches ' + hits.length + ' investors in the registry.');
  });
  ['LP','GP'].forEach(function(c){
    var t = inv.filter(function(x){ return (String(x.class||'LP').toUpperCase()==='GP'?'GP':'LP') === c; })
               .reduce(function(a,x){ return a + (Number(x.sharePct)||0); }, 0);
    if(t > 1 + 1e-9) out.push(c + ' shares sum to ' + (t*100).toFixed(2) + '% (over 100%).');
  });
  return out;
}

/* mode: undefined = automatic (stops on conflict); 'separate' = user chose to
   create a new registry investor for every legacy row. */
window.bkMigrateLegacyInvestors = function(reason, mode){
  if(typeof bkIsProvisioned === 'function' && !bkIsProvisioned()) return { migrated:false, reason:'no deal' };
  var s = bkLoad();
  var inv = Array.isArray(s.investors) ? s.investors : [];
  if(!inv.length) return { migrated:false, reason:'nothing to migrate' };
  if(Array.isArray(s.commitments) && s.commitments.length){
    // both exist: the registry model already treats commitments as authoritative
    s._legacyInvestorsArchive = { list: inv, archivedAt: new Date().toISOString(), note:'commitments already existed; legacy list archived unchanged' };
    s.investors = []; delete s._legacyInvestorConflicts; bkSave(s);
    return { migrated:true, archivedOnly:true };
  }
  var c = mode === 'separate' ? [] : conflicts(s);
  if(c.length){ s._legacyInvestorConflicts = c; bkSave(s); return { migrated:false, conflicts:c }; }

  var legacyCommits = bkDealCommitments(s);          // canonical legacy reader - same sizing as before
  var reg = bkInvestorRegistryLoad(), map = [];
  var commits = legacyCommits.map(function(lc, i){
    var x = inv[i], n = norm(x.name);
    var hit = mode === 'separate' ? null : reg.filter(function(r){ return norm(r.name) === n; })[0];
    var isGP = String(x.class||'LP').toUpperCase() === 'GP';
    if(!hit){
      hit = bkInvestorRegistryAdd({ name: x.name || ('Investor ' + (i+1)), defaultClass: isGP ? 'GP' : 'LP',
                                    notes: 'Migrated from legacy deal investor list (' + (s.dealId || s.name || 'deal') + ')' });
      reg = bkInvestorRegistryLoad();
    }
    map.push({ legacyName: x.name, investorId: hit.id, created: hit.notes && /Migrated/.test(hit.notes) });
    return { investorId: hit.id, commitment: lc.commitment, calls: lc.calls,
             classOverride: isGP ? 'GP' : 'LP', migratedFromLegacy: true };
  });
  s = bkLoad();
  s.commitments = commits;
  s._legacyInvestorsArchive = { list: inv, map: map, archivedAt: new Date().toISOString(), reason: reason || '' };
  s.investors = [];
  delete s._legacyInvestorConflicts;
  bkSave(s);
  return { migrated:true, count: commits.length, map: map };
};
window.bkResolveLegacyInvestors = function(){
  var r = window.bkMigrateLegacyInvestors('user resolution', 'separate');
  if(typeof showSheet === 'function') showSheet(currentSheet);
  return r;
};

/* Legacy editors are gone; keep the global names so a stale onclick can never throw. */
window.bkInvAdd = function(){ if(typeof bkCommitAdd === 'function') bkCommitAdd(); };
window.bkInvSet = function(){ return false; };
window.bkInvRemove = function(){ return false; };

function conflictBanner(s){
  var c = s._legacyInvestorConflicts;
  if(!Array.isArray(c) || !c.length) return '';
  return '<div class="note-flag"><span>&#9888;</span><div><b>Legacy investor list needs a decision.</b> '
    + 'This deal still carries a pre-registry investor list that could not be migrated automatically: '
    + c.map(bkEsc).join(' ') + ' Nothing was changed. '
    + '<div style="margin-top:8px"><button type="button" class="status-chip pass" onclick="bkResolveLegacyInvestors()">'
    + 'Migrate as separate registry investors</button></div></div></div>';
}
window.bkLegacyInvestorBanner = function(){ try{ return conflictBanner(bkLoad()); }catch(e){ return ''; } };

function money(n){ return (typeof n === 'number' && isFinite(n)) ? (n < 0 ? '($'+bkFmt(-n)+')' : '$'+bkFmt(n)) : '-'; }
function ledger(){ try{ return bkInvestorLedger(); }catch(e){ return null; } }

/* Base pages: the registry layers (invRegistry / invSchedules / invCalls /
   invRollup) render the canonical content; the base supplies title + header. */
function headerPage(title, desc){
  var s = bkLoad(), led = ledger(), reg = bkInvestorRegistryLoad();
  var n = led ? led.investors.length : 0;
  var main = conflictBanner(s)
    + '<div class="note-flag"><span>&#9432;</span><div><b>One investor system.</b> Investors are created once in the '
    + 'Investor Registry; this deal\'s participation is its commitments and capital calls. Schedules, liquidity, '
    + 'portfolio rollups and exports are all calculated from those - there is no second editable list.</div></div>';
  var sidebar = sidebarShell('<div class="card"><div class="card-head">Investors</div><div class="metric-list">'
    + '<div class="metric-row"><span class="k">Registry</span><span class="v">' + reg.length + '</span></div>'
    + '<div class="metric-row"><span class="k">On This Deal</span><span class="v">' + n + '</span></div>'
    + '<div class="metric-row"><span class="k">Funded</span><span class="v">' + money(led ? led.funded : 0) + '</span></div>'
    + '</div></div>' + modelInfoCard('<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio &amp; Investors</span></div>') + colorKeyCard());
  return { title:title, crumbs:'Portfolio & Investors', desc:desc,
           meta:{ Property: s.name || '-', 'Registry Investors': reg.length, 'Deal Investors': n, Currency:'USD' },
           main: main, sidebar: sidebar };
}
RENDERERS['Investors'] = function(){ return headerPage('Investors', 'Investor Registry and this deal\'s commitments.'); };
RENDERERS['Investor Schedules'] = function(){ return headerPage('Investor Schedules', 'Per-investor cash flows calculated from registry investors and this deal\'s funded commitments.'); };
RENDERERS['Liquidity'] = function(){
  var o = headerPage('Liquidity', 'Capital return / payback timing for each investor and the deal overall.');
  var s = bkLoad(), w = bkWaterfallV07(), led = ledger();
  var m2 = function(n){ return n<0 ? '('+bkFmt(-n)+')' : bkFmt(n); };
  /* Deal-level payback: unchanged from the pre-V30 page (first month cumulative LP+GP
     distributions reach total contributed capital). */
  var cum=0, idx=null, dealContrib = w.lp.contrib + w.gp.contrib;
  for(var i=0;i<w.rows.length;i++){ cum += w.rows[i].lpDist + w.rows[i].gpDist; if(idx===null && dealContrib>0 && cum>=dealContrib) idx=i; }
  var dealPayback = idx!==null ? 'Month '+w.rows[idx].m+' ('+w.rows[idx].dt.toISOString().slice(0,7)+')' : 'Not by exit';
  /* Investor payback: the same definition, applied to each registry investor's ledger slice. */
  var rows = (led && led.investors.length) ? led.investors.map(function(x){
    var c=0, d=0, pay=null;
    x.months.forEach(function(m){ c += m.con; d += m.dist; if(pay===null && c>0 && d>=c) pay=m; });
    return '<tr><td class="rowlabel">'+bkEsc(x.terms.name||'-')+'</td><td>'+x.terms.cls+'</td><td>'+m2(x.totCon)+'</td><td>'
      + (pay ? 'Mo. '+pay.m+' ('+new Date(pay.dt).toISOString().slice(0,7)+')' : 'Not by exit')+'</td><td>'
      + (isFinite(x.moic) ? x.moic.toFixed(2)+'x' : '-')+'</td></tr>';
  }).join('') : '<tr><td class="rowlabel" colspan="5">No registry investors have commitments on this deal yet.</td></tr>';
  o.main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Liquidity - Capital Return / Payback, Active Deal</caption>'
    + '<thead><tr><th class="rowlabel-h">Investor</th><th>Class</th><th>Capital Contributed</th><th>Payback Reached</th><th>MOIC at Exit</th></tr></thead><tbody>'
    + rows + '<tr class="grandtotal"><td class="rowlabel">Deal-Level (All Capital)</td><td></td><td>'+m2(dealContrib)+'</td><td>'+dealPayback+'</td><td>-</td></tr>'
    + '</tbody></table></div>'
    + '<div class="note-flag"><span>&#9888;</span><div><b>Payback / return-of-capital timing, not a secondary market -</b> "Payback Reached" is the first month cumulative distributions (net of management fees) equal cumulative capital contributed.</div></div>';
  o.meta['Deal Payback'] = dealPayback;
  return o;
};

/* Canonical investor export: registry investors x this deal's commitments, from the ledger. */
window.bkExportInvestorSchedules = function(){
  var s = bkLoad(), led = ledger(), fn = (typeof bkSlug === 'function' ? bkSlug(s.name) : 'Deal') + '_Investor_Schedules.csv';
  var base = { name:'Investor Schedules', filename:fn, headers:[], rows:[], count:0 };
  if(!led) return Object.assign(base, { available:false, note:'Investor ledger unavailable for this deal (engine error).' });
  if(!led.investors.length) return Object.assign(base, { available:false, note:'No registry investors have commitments on this deal.' });
  var headers = ['Investor ID','Investor','Class','Funded Share','Month','Date','Contribution','Distribution (net)','Mgmt Fee','Net Cash Flow'];
  var rows = [];
  led.investors.forEach(function(x){
    x.months.forEach(function(m){ rows.push([x.terms.id, x.terms.name, x.terms.cls, x.share, m.m, m.dt, m.con, m.dist, m.mgmtFee, m.net]); });
  });
  rows.push([]); rows.push(['--- INVESTOR SUMMARY ---']);
  rows.push(['Investor ID','Investor','Class','Commitment','Funded','Unfunded','Total Contribution','Total Distribution (net)','Total Mgmt Fees','XIRR','MOIC']);
  led.investors.forEach(function(x){
    rows.push([x.terms.id, x.terms.name, x.terms.cls, x.commitment, x.funded, x.unfunded, x.totCon, x.totDist, x.totFee, x.xirr, x.moic]);
  });
  rows.push([]); rows.push(['--- CONSERVATION ---']);
  rows.push(['Investor Distributions + Fees', led.conservation.investorDist]);
  rows.push(['GP Take', led.conservation.gpDist]);
  rows.push(['Deal Distributions', led.conservation.dealDist]);
  rows.push(['Variance', led.conservation.distVariance]);
  return Object.assign(base, { headers:headers, rows:rows, count:led.investors.length, available:true });
};
if(typeof BK_EXPORT_REGISTRY !== 'undefined'){
  BK_EXPORT_REGISTRY.forEach(function(r){
    if(r.key === 'investors'){ r.builder = window.bkExportInvestorSchedules;
      r.desc = 'Per-investor monthly cash flow and summary from the Investor Registry and this deal\'s commitments (bkInvestorLedger).'; }
  });
}
})();
