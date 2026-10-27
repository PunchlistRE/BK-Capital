
/* ===========================================================================
   INVESTOR ARCHITECTURE - MODEL AND ENGINE
   ===========================================================================
   Deal -> Investor -> Commitment / Funded Actual -> individual terms ->
   monthly distributions -> portfolio-wide investor rollup.

   THE FOUR CONVENTIONS THIS IMPLEMENTS, EACH ONE A DECISION BK MADE:

     1. Identity: a GLOBAL investor registry holds each investor once with a
        stable id and default terms. A deal may OVERRIDE any term locally. The
        resolver below is the only place the two are combined, so there is one
        answer to "what terms does this investor have on this deal".

     2. Distributions are allocated on FUNDED ACTUAL, not on commitment. An
        unfunded commitment is shown as a remaining obligation and earns
        nothing. Every allocation fraction in this file is funded / total
        funded.

     3. Individual terms are real, not cosmetic: preferred return, promote
        share, class and catch-up participation, and a management fee load can
        all differ investor by investor.

     4. Sponsor fee income is a SEPARATE toggle (see the sponsor block). It
        never moves project economics.

   HOW INDIVIDUAL TERMS ARE HONOURED WITHOUT A SECOND WATERFALL.
   The deal's monthly contribution and distribution stream is partitioned by
   each investor's funded share. Each slice is then run through the CANONICAL
   bkWaterfallV07(), via the optional stream argument added to it, carrying
   that investor's own preferred return and promote. The GP receives whatever
   the tiers leave in each slice. Because the slices partition the deal stream,
   the sum of every investor's distributions plus the GP's take equals the
   deal's total distributions exactly - which is asserted on the page as a
   conservation check rather than assumed here.

   WHAT THIS DOES NOT DO. It does not change any existing figure. Deals that
   carry the legacy investors[]/sharePct list keep every number they had: the
   migration below reads that list as fully-funded commitments, and the legacy
   bkInvestorMetrics() / bkInvestorMonthly() path is left exactly as it was.
   =========================================================================== */
(function(){
'use strict';

var REG_STORE = 'bkcapital.cre.investors.v01';

/* ---------------------------------------------------------------
   1. GLOBAL REGISTRY
   --------------------------------------------------------------- */
window.bkInvestorRegistryLoad = function(){
  try { var a = JSON.parse(localStorage.getItem(REG_STORE) || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
};
window.bkInvestorRegistrySave = function(arr){
  try { localStorage.setItem(REG_STORE, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch(e){}
  return arr;
};
window.bkInvestorRegistryAdd = function(seed){
  var reg = bkInvestorRegistryLoad();
  reg.push(Object.assign({
    id: 'inv-' + Date.now() + '-' + reg.length,
    name: 'New Investor',
    defaultClass: 'LP',
    defaultPref: null,            // null = follow the deal's own pref
    defaultPromoteShare: null,    // null = follow the deal's own tier splits
    defaultMgmtFeePct: 0,
    defaultCatchup: null,         // null = follow the deal
    notes: ''
  }, seed || {}));
  bkInvestorRegistrySave(reg);
  return reg[reg.length - 1];
};
window.bkInvestorRegistrySet = function(id, key, value){
  var reg = bkInvestorRegistryLoad();
  var r = reg.filter(function(x){ return x.id === id; })[0];
  if(!r) return null;
  r[key] = value;
  bkInvestorRegistrySave(reg);
  return r;
};
window.bkInvestorRegistryRemove = function(id){
  bkInvestorRegistrySave(bkInvestorRegistryLoad().filter(function(x){ return x.id !== id; }));
};

/* ---------------------------------------------------------------
   2. COMMITMENTS ON A DEAL, AND THE LEGACY MIGRATION
   ---------------------------------------------------------------
   A commitment is {investorId, commitment, calls:[{date, required, funded}]}
   plus optional per-deal term overrides. A deal that has none but carries the
   legacy investors[] list is read as fully-funded commitments sized by the
   legacy sharePct, so nothing that worked before stops working.
   --------------------------------------------------------------- */
function legacyAsCommitments(s){
  var inv = Array.isArray(s.investors) ? s.investors : [];
  if(!inv.length) return [];
  var equity = 0;
  try { var w = bkWaterfallV07(); equity = Math.abs(w.lp.contrib) + Math.abs(w.gp.contrib); } catch(e){}
  return inv.map(function(x, i){
    var isGP = String(x.class || 'LP').toUpperCase() === 'GP';
    var share = Number(x.sharePct) || 0;
    // The legacy model states a share of the CLASS, so size the commitment from
    // that class's own contributed equity.
    var classEquity = 0;
    try { var w2 = bkWaterfallV07(); classEquity = Math.abs(isGP ? w2.gp.contrib : w2.lp.contrib); } catch(e){}
    var amt = classEquity * share;
    return {
      investorId: x.id || ('legacy-' + i),
      legacy: true,
      nameOverride: x.name || null,
      classOverride: isGP ? 'GP' : 'LP',
      commitment: amt,
      calls: [{ date: s.closing || null, required: amt, funded: amt }],
      _legacyShare: share, _legacyEquity: equity
    };
  });
}

window.bkDealCommitments = function(s){
  s = s || bkLoad();
  var c = Array.isArray(s.commitments) ? s.commitments : [];
  if(c.length) return c;
  return legacyAsCommitments(s);
};

window.bkCommitmentFunded = function(c){
  return (c.calls || []).reduce(function(a, k){ return a + (Number(k.funded) || 0); }, 0);
};
window.bkCommitmentRequired = function(c){
  return (c.calls || []).reduce(function(a, k){ return a + (Number(k.required) || 0); }, 0);
};

/* ---------------------------------------------------------------
   3. TERM RESOLVER - registry default, then per-deal override
   ---------------------------------------------------------------
   The ONLY place the two layers are combined. Anything null or undefined at
   both levels falls through to the deal's own term, so an investor with no
   special terms behaves exactly like the class they sit in.
   --------------------------------------------------------------- */
window.bkInvestorTerms = function(commitment, s){
  s = s || bkLoad();
  var reg = bkInvestorRegistryLoad();
  var r = reg.filter(function(x){ return x.id === commitment.investorId; })[0] || {};
  function pick(overrideKey, defaultKey, dealValue){
    var o = commitment[overrideKey];
    if(o !== undefined && o !== null && o !== '') return o;
    var d = r[defaultKey];
    if(d !== undefined && d !== null && d !== '') return d;
    return dealValue;
  }
  var cls = String(pick('classOverride', 'defaultClass', 'LP')).toUpperCase() === 'GP' ? 'GP' : 'LP';
  var pref = Number(pick('prefOverride', 'defaultPref', Number(s.pref) || 0));
  var promoteShare = pick('promoteShareOverride', 'defaultPromoteShare', null);
  var mgmtFeePct = Number(pick('mgmtFeeOverride', 'defaultMgmtFeePct', 0)) || 0;
  var catchup = pick('catchupOverride', 'defaultCatchup', null);
  return {
    id: commitment.investorId,
    name: commitment.nameOverride || r.name || commitment.investorId || 'Investor',
    cls: cls,
    pref: isFinite(pref) ? pref : (Number(s.pref) || 0),
    promoteShare: (promoteShare === null || promoteShare === undefined || promoteShare === '')
                  ? null : Number(promoteShare),
    mgmtFeePct: mgmtFeePct,
    catchup: (catchup === null || catchup === undefined || catchup === '')
             ? null : !!Number(catchup),
    // provenance, so the UI can show WHERE each term came from rather than
    // presenting a resolved number with no explanation
    src: {
      cls:      commitment.classOverride        != null && commitment.classOverride        !== '' ? 'deal' : (r.defaultClass        != null ? 'registry' : 'deal default'),
      pref:     commitment.prefOverride         != null && commitment.prefOverride         !== '' ? 'deal' : (r.defaultPref         != null ? 'registry' : 'deal default'),
      promote:  commitment.promoteShareOverride != null && commitment.promoteShareOverride !== '' ? 'deal' : (r.defaultPromoteShare != null ? 'registry' : 'deal default'),
      mgmtFee:  commitment.mgmtFeeOverride      != null && commitment.mgmtFeeOverride      !== '' ? 'deal' : (r.defaultMgmtFeePct   != null ? 'registry' : 'deal default'),
      catchup:  commitment.catchupOverride      != null && commitment.catchupOverride      !== '' ? 'deal' : (r.defaultCatchup      != null ? 'registry' : 'deal default')
    },
    registered: !!r.id
  };
};

/* ---------------------------------------------------------------
   4. PER-INVESTOR MONTHLY LEDGER
   ---------------------------------------------------------------
   Each investor's funded slice of the deal stream, run through the CANONICAL
   waterfall on that investor's own terms.
   --------------------------------------------------------------- */
window.bkInvestorLedger = function(){
  var s = bkLoad(), w;
  try { w = bkWaterfallV07(); } catch(e){ return null; }
  if(!w || !w.rows || !w.rows.length) return null;

  var commits = bkDealCommitments(s);
  if(!commits.length) return { investors: [], rows: w.rows, deal: w, funded: 0, committed: 0 };

  var funded = commits.map(bkCommitmentFunded);
  var totalFunded = funded.reduce(function(a, b){ return a + b; }, 0);
  var totalCommitted = commits.reduce(function(a, c){ return a + (Number(c.commitment) || 0); }, 0);
  var dealEquity = Math.abs(w.lp.contrib) + Math.abs(w.gp.contrib);

  var investors = commits.map(function(c, i){
    var t = bkInvestorTerms(c, s);
    var f = totalFunded > 0 ? funded[i] / totalFunded : 0;

    // the slice: a strict partition of the deal's own monthly stream
    var sliceRows = w.rows.map(function(r){
      return { m: r.m, dt: r.dt, cf: (Number(r.con) ? -r.con : r.dist) * f,
               wfContrib: (Number(r.con) || 0) * f, wfDist: (Number(r.dist) || 0) * f };
    });

    // that investor's own terms, expressed in the fields the canonical engine reads
    var terms = Object.assign({}, s);
    terms.pref = t.pref;
    terms.gpShare = 0;                        // the slice holds this investor's capital only
    if(t.promoteShare !== null && isFinite(t.promoteShare)){
      terms.t2LP = 1 - t.promoteShare;
      terms.t3LP = 1 - t.promoteShare;
      terms.t4LP = 1 - t.promoteShare;
    }
    if(t.catchup !== null) terms.gpCatchup = t.catchup ? 1 : 0;

    var sub = null;
    try { sub = bkWaterfallV07({ x: { s: terms, rows: sliceRows }, s: terms }); } catch(e){}
    if(!sub) return { terms: t, funded: funded[i], commitment: Number(c.commitment) || 0, months: [], error: true };

    // management fee: annual rate on funded capital, accrued monthly, paid out of
    // this investor's distributions when there are any, carried in arrears when
    // there are not, and credited to the GP. Stated so it can be argued with.
    var feeRate = (Number(t.mgmtFeePct) || 0) / 12;
    var arrears = 0, run = 0;
    var months = sub.rows.map(function(r, k){
      var accrued = feeRate * funded[i];
      var due = accrued + arrears;
      var grossDist = Number(r.lpDist) || 0;
      var feePaid = Math.min(due, grossDist);
      arrears = due - feePaid;
      var con = Math.abs(Number(r.lpCon) || 0);
      var dist = grossDist - feePaid;
      run += con - dist;
      return { m: r.m, dt: r.dt, con: con, distGross: grossDist, mgmtFee: feePaid,
               dist: dist, net: dist - con, unreturned: Math.max(0, run),
               gpTake: Number(r.gpDist) || 0, promote: Number(r.promote) || 0,
               b1: r.b1, b2: r.b2, b3: r.b3 };
    });

    var totCon  = months.reduce(function(a, m){ return a + m.con; }, 0);
    var totDist = months.reduce(function(a, m){ return a + m.dist; }, 0);
    var totFee  = months.reduce(function(a, m){ return a + m.mgmtFee; }, 0);
    var totGP   = months.reduce(function(a, m){ return a + m.gpTake; }, 0);
    var xirr = NaN;
    try { xirr = bkXirr(months.map(function(m){ return m.net; }), months.map(function(m){ return new Date(m.dt); })); } catch(e){}

    return {
      terms: t, commitment: Number(c.commitment) || 0, funded: funded[i],
      required: bkCommitmentRequired(c), calls: c.calls || [],
      unfunded: Math.max(0, (Number(c.commitment) || 0) - funded[i]),
      share: f, months: months,
      totCon: totCon, totDist: totDist, totFee: totFee, totGP: totGP,
      moic: totCon > 0 ? totDist / totCon : NaN, xirr: xirr,
      unreturned: months.length ? months[months.length - 1].unreturned : 0,
      legacy: !!c.legacy
    };
  });

  // conservation, computed not claimed
  var invDist = investors.reduce(function(a, x){ return a + x.totDist + x.totFee; }, 0);
  var gpDist  = investors.reduce(function(a, x){ return a + x.totGP; }, 0);
  var dealDist = w.rows.reduce(function(a, r){ return a + (Number(r.dist) || 0); }, 0);
  var invCon  = investors.reduce(function(a, x){ return a + x.totCon; }, 0);
  var dealCon = w.rows.reduce(function(a, r){ return a + (Number(r.con) || 0); }, 0);

  return {
    investors: investors, rows: w.rows, deal: w,
    funded: totalFunded, committed: totalCommitted, dealEquity: dealEquity,
    conservation: {
      investorDist: invDist, gpDist: gpDist, dealDist: dealDist,
      distVariance: (invDist + gpDist) - dealDist,
      investorCon: invCon, dealCon: dealCon, conVariance: invCon - dealCon,
      fundedVsEquity: totalFunded - dealEquity
    }
  };
};

/* ---------------------------------------------------------------
   5. PORTFOLIO-WIDE INVESTOR ROLLUP
   ---------------------------------------------------------------
   The same investor across every saved deal, on one calendar.
   --------------------------------------------------------------- */
window.bkInvestorPortfolio = function(){
  var saved = [];
  try { saved = bkPortfolioLoad() || []; } catch(e){ return null; }
  var reg = bkInvestorRegistryLoad();
  var byId = {};

  saved.forEach(function(snap){
    var origLoad = window.bkLoad, origSave = window.bkSave;
    var scratch = JSON.parse(JSON.stringify(snap));
    window.bkLoad = function(){ return scratch; };
    window.bkSave = function(d){ Object.assign(scratch, d); return d; };
    var led = null;
    try { led = bkInvestorLedger(); } catch(e){}
    finally { window.bkLoad = origLoad; window.bkSave = origSave; }
    if(!led || !led.investors.length) return;
    led.investors.forEach(function(inv){
      var id = inv.terms.id;
      if(!byId[id]) byId[id] = { id: id, name: inv.terms.name, cls: inv.terms.cls,
                                 deals: [], committed: 0, funded: 0, unfunded: 0,
                                 dist: 0, fees: 0, flows: [] };
      var e = byId[id];
      e.deals.push({ deal: snap.name || snap.dealId, commitment: inv.commitment, funded: inv.funded,
                     dist: inv.totDist, moic: inv.moic, xirr: inv.xirr });
      e.committed += inv.commitment; e.funded += inv.funded; e.unfunded += inv.unfunded;
      e.dist += inv.totDist; e.fees += inv.totFee;
      inv.months.forEach(function(m){ if(m.net) e.flows.push({ dt: new Date(m.dt), v: m.net }); });
    });
  });

  var list = Object.keys(byId).map(function(k){
    var e = byId[k];
    e.flows.sort(function(a, b){ return a.dt - b.dt; });
    e.moic = e.funded > 0 ? e.dist / e.funded : NaN;
    e.unreturned = Math.max(0, e.funded - e.dist);
    try { e.xirr = e.flows.length > 1 ? bkXirr(e.flows.map(function(f){ return f.v; }),
                                               e.flows.map(function(f){ return f.dt; })) : NaN; }
    catch(err){ e.xirr = NaN; }
    var r = reg.filter(function(x){ return x.id === e.id; })[0];
    e.registered = !!r;
    return e;
  }).sort(function(a, b){ return b.funded - a.funded; });

  return { investors: list, deals: saved.length, registry: reg };
};

/* ---------------------------------------------------------------
   6. COMMITMENT AND CALL EDITING
   --------------------------------------------------------------- */
function commitsOf(s){ return Array.isArray(s.commitments) ? s.commitments.slice() : []; }
function saveCommits(c){ var s = bkLoad(); s.commitments = c; bkSave(s);
  if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Investors'); }

window.bkCommitAdd = function(investorId){
  var s = bkLoad(), c = commitsOf(s);
  // a deal still on the legacy list is materialised first, so adding one
  // commitment never silently discards the investors already there
  if(!c.length){
    var legacy = bkDealCommitments(s);
    c = legacy.map(function(x){ var y = Object.assign({}, x); delete y.legacy; return y; });
  }
  var reg = bkInvestorRegistryLoad();
  var pickId = investorId || (reg[0] && reg[0].id);
  if(!pickId){ var made = bkInvestorRegistryAdd({}); pickId = made.id; }
  c.push({ investorId: pickId, commitment: 0, calls: [] });
  saveCommits(c);
};
window.bkCommitRemove = function(idx){ var c = commitsOf(bkLoad()); c.splice(idx, 1); saveCommits(c); };
window.bkCommitSet = function(idx, key, v){
  var c = commitsOf(bkLoad()); if(!c[idx]) return;
  var numeric = ['commitment'], pctKeys = ['prefOverride','promoteShareOverride','mgmtFeeOverride'];
  if(numeric.indexOf(key) > -1) c[idx][key] = Number(String(v).replace(/[$,]/g, '')) || 0;
  else if(pctKeys.indexOf(key) > -1){
    var n = Number(String(v).replace(/[%,]/g, ''));
    c[idx][key] = (v === '' || v === null || !isFinite(n)) ? null : n / 100;
  }
  else if(key === 'catchupOverride') c[idx][key] = (v === '' ? null : (String(v) === '1' ? 1 : 0));
  else c[idx][key] = (v === '' ? null : v);
  saveCommits(c);
};
window.bkCallAdd = function(idx){
  var c = commitsOf(bkLoad()); if(!c[idx]) return;
  var calls = (c[idx].calls || []).slice();
  var remaining = Math.max(0, (Number(c[idx].commitment) || 0)
                  - calls.reduce(function(a, k){ return a + (Number(k.required) || 0); }, 0));
  calls.push({ date: null, required: remaining, funded: 0 });
  c[idx] = Object.assign({}, c[idx], { calls: calls });
  saveCommits(c);
};
window.bkCallSet = function(idx, ci, key, v){
  var c = commitsOf(bkLoad()); if(!c[idx] || !c[idx].calls || !c[idx].calls[ci]) return;
  var calls = c[idx].calls.slice();
  calls[ci] = Object.assign({}, calls[ci],
    key === 'date' ? { date: v || null } : (function(o){ o[key] = Number(String(v).replace(/[$,]/g, '')) || 0; return o; })({}));
  c[idx] = Object.assign({}, c[idx], { calls: calls });
  saveCommits(c);
};
window.bkCallRemove = function(idx, ci){
  var c = commitsOf(bkLoad()); if(!c[idx] || !c[idx].calls) return;
  var calls = c[idx].calls.slice(); calls.splice(ci, 1);
  c[idx] = Object.assign({}, c[idx], { calls: calls });
  saveCommits(c);
};
window.bkCallFundAll = function(idx){
  var c = commitsOf(bkLoad()); if(!c[idx]) return;
  c[idx] = Object.assign({}, c[idx], { calls: (c[idx].calls || []).map(function(k){
    return Object.assign({}, k, { funded: Number(k.required) || 0 }); }) });
  saveCommits(c);
};

/* ---------------------------------------------------------------
   7. SPONSOR FEE INCOME - the explicit toggle
   ---------------------------------------------------------------
   PROJECT ECONOMICS NEVER MOVE. The development fee and the construction
   management fee stay capitalised into the development cost ladder in every
   toggle state, exactly as bkDevV09() already computes them - so total
   development cost, yield on cost, project NOI and every return figure are
   identical whatever this is set to. That is asserted by the verification,
   not asserted here.

   What the toggle changes is SPONSOR economics only: whether fee income is
   recognised in the sponsor's own cash flow. Two settings, because the
   application already treated two groups of fees differently and hiding that
   would be worse than showing it:
     - sponsorFeeIncome        (default Included) - acquisition, asset
       management and disposition fees, which bkSponsorV08() has always
       included in sponsor CF.
     - sponsorDevFeeIncome     (default Excluded) - the development and
       construction management fees, which this engine has always capitalised
       and never recognised as sponsor revenue. Turning it on is the
       workbook's own treatment: the fee is a project cost AND sponsor income.
   Both defaults reproduce today's figures exactly, which is why turning the
   second one on is a deliberate act rather than a silent change.
   --------------------------------------------------------------- */
if(typeof BK_BASE !== 'undefined'){
  if(!('sponsorFeeIncome'    in BK_BASE)) BK_BASE.sponsorFeeIncome    = 'Included';
  if(!('sponsorDevFeeIncome' in BK_BASE)) BK_BASE.sponsorDevFeeIncome = 'Excluded';
}

window.bkSponsorFees = function(){
  var s = bkLoad();
  var out = { devFee: 0, cmFee: 0, hasDev: false, months: [] };
  if(String(s.dealType || '').toLowerCase() !== 'development') return out;
  // PROBE CORRECTION: the soft-cost ladder is not a zero-argument helper - it is
  // bkDevSoftCostLadder(s, gsf, hardTotal, price, kScale), and calling it directly
  // would mean re-deriving its four arguments here, which is how a second cost
  // engine gets written by accident. bkDevV09() already ran it and carries the
  // result, so read that.
  var soft = null, fund = null;
  try { var dv = bkDevV09(); soft = dv && dv.softLadder ? dv.softLadder : null; } catch(e){ return out; }
  try { fund = (typeof bkDevFundingV10 === 'function') ? bkDevFundingV10() : null; } catch(e){}
  if(!soft) return out;
  out.hasDev = true;
  out.devFee = Number(soft.devFee) || 0;
  var cm = (soft.lines || []).filter(function(l){ return /Construction Management/i.test(l.name); })[0];
  out.cmFee = cm ? (Number(cm.total) || 0) : 0;

  // Timing is taken from the draw schedule the engine already produces, not
  // invented: the CM fee is charged on hard cost, so it is earned as hard cost
  // is drawn; the development fee is charged on hard plus soft subtotal, so it
  // is earned as those are drawn. No new curve, no new assumption.
  if(fund && fund.months && fund.months.length){
    var hardTot = fund.months.reduce(function(a, m){ return a + (Number(m.hard) || 0); }, 0);
    var bothTot = fund.months.reduce(function(a, m){ return a + (Number(m.hard) || 0) + (Number(m.soft) || 0); }, 0);
    out.months = fund.months.map(function(m){
      var hs = hardTot > 0 ? (Number(m.hard) || 0) / hardTot : 0;
      var bs = bothTot > 0 ? ((Number(m.hard) || 0) + (Number(m.soft) || 0)) / bothTot : 0;
      return { mo: m.mo, cmFee: out.cmFee * hs, devFee: out.devFee * bs };
    });
  }
  return out;
};

window.bkSponsorEconomics = function(){
  var s = bkLoad(), base = null;
  try { base = bkSponsorV08(); } catch(e){ return null; }
  var includeOps = String(s.sponsorFeeIncome || 'Included') !== 'Excluded';
  var includeDev = String(s.sponsorDevFeeIncome || 'Excluded') === 'Included';
  var devFees = bkSponsorFees();

  var opsFees = Number(base.totalFees) || 0;                 // acq + AM + disposition
  var devFeeTotal = includeDev ? (devFees.devFee + devFees.cmFee) : 0;

  // rebuild the sponsor stream from the canonical rows; no figure is recomputed,
  // only included or excluded
  var byMo = {};
  (devFees.months || []).forEach(function(m){ byMo[m.mo] = (m.devFee || 0) + (m.cmFee || 0); });
  var rows = base.rows.map(function(r){
    var ops = includeOps ? (Number(r.fees) || 0) : 0;
    var dev = includeDev ? (Number(byMo[r.m]) || 0) : 0;
    return Object.assign({}, r, { opsFeeIncome: ops, devFeeIncome: dev,
                                  feeIncome: ops + dev, sponsorAll: (Number(r.gpCF) || 0) + ops + dev });
  });
  var dates = rows.map(function(r){ return r.dt; });
  var xirr = NaN;
  /* same dating as the Sponsor Economics Summary (bkSponsorV08): the closing equity, less the acquisition fee when it is counted, is dated the closing day, not the first month-end */
  try { var w0 = base.w, eq0 = Number(w0 && w0.x && w0.x.rows[0] && w0.x.rows[0].eqDraw) || 0, closeAmt = -eq0 * (Number(s.gpShare) || 0) + (includeOps ? (Number(base.acqFee) || 0) : 0);
    xirr = bkXirrClose(rows.map(function(r){ return r.sponsorAll; }), dates, w0 && w0.x && w0.x.closeDt, closeAmt); } catch(e){ try { xirr = bkXirr(rows.map(function(r){ return r.sponsorAll; }), dates); } catch(e2){} }
  var totalFeeIncome = rows.reduce(function(a, r){ return a + r.feeIncome; }, 0);
  var gpContrib = Number(base.gpContrib) || 0, gpDist = Number(base.gpDist) || 0;

  return {
    base: base, rows: rows,
    includeOps: includeOps, includeDev: includeDev,
    opsFees: includeOps ? opsFees : 0,
    devFee: devFees.devFee, cmFee: devFees.cmFee, hasDev: devFees.hasDev,
    devFeeIncome: devFeeTotal,
    totalFeeIncome: totalFeeIncome,
    promote: Number(base.promote) || 0,
    gpContrib: gpContrib, gpDist: gpDist,
    sponsorXIRR: xirr,
    sponsorMOIC: gpContrib ? (gpDist + totalFeeIncome) / gpContrib : NaN,
    sponsorProfit: rows.reduce(function(a, r){ return a + r.sponsorAll; }, 0)
  };
};

window.bkSetSponsorFeeIncome = function(v){
  var s = bkLoad(); s.sponsorFeeIncome = (String(v) === 'Excluded') ? 'Excluded' : 'Included'; bkSave(s);
  if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Sponsor CF');
};
window.bkSetSponsorDevFeeIncome = function(v){
  var s = bkLoad(); s.sponsorDevFeeIncome = (String(v) === 'Included') ? 'Included' : 'Excluded'; bkSave(s);
  if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Sponsor CF');
};

})();
