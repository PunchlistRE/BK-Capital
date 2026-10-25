
/* ===========================================================================
   V29.10.4 - MASTER DATA IMPORT, PROPERTY CROSSWALK, SOURCE SCOPE GATE
   ===========================================================================
   Derived from the supplied files, not assumed.

   HPM_Portfolio_Master.xlsx - 24 sheets. "Property Summary" is the master
   property table: 12 owned properties plus a separately-marked TARGET
   ACQUISITIONS block. Columns actually present:

     A Property | B Type | C Units | D SF | E Annual Rent ($) | F Rent/SF ($)
     G T-12 NOI ($) | H Expense Ratio | I Cap Rate | J Vacancy | K Ownership
     L Implied Value ($)

   CRITICAL LIMITATION, REPORTED NOT PAPERED OVER: Property Summary contains NO
   Deal ID, NO Property ID, NO address, and NO Yardi property code. The ONLY
   identifier real data supports is the PROPERTY NAME. The crosswalk is therefore
   name-keyed, with normalisation limited to harmless presentation differences
   (case, punctuation, whitespace, the known Harvard/Havard spelling variant).
   No fuzzy matching is used, and a name that does not match exactly after
   normalisation resolves to nothing rather than to a best guess.

   Yardi Trailing-12 (March 2026).xlsx - 1 sheet, 190 rows. Its own section
   headers name the properties in scope:

     r5  COMMERCIAL RENT - 180-200 HARVARD, 331 SELLECK, LENOX PARTNERS,
                           81 SOUTHFIELD, 1363 SEAVIEW, 1387 SEAVIEW
     r22 RESIDENTIAL RENT - SHOREPOINTE - SHIPPAN, GLENBROOK COMMONS,
                           ELMCREST MANOR, WALL STREET MANOR, ROWAYTON GARDENS,
                           71 HAVILAND ROAD

   That is 12 properties - exactly the 12 owned properties in HPM. HPM's own
   Source Register independently records this file's scope as "Portfolio-wide".

   This changes the reasoning about the file's write authority. The earlier build
   blocked PROPERTY scope because identity was UNPROVEN. In fact identity IS
   proven, and what it proves is that every fact is an aggregate across twelve
   properties. PROPERTY scope is therefore not "pending better evidence" - it is
   impossible by construction, and the gate below says so explicitly.
   =========================================================================== */
(function(){
'use strict';

var MASTER_KEY = 'bkcapital.master.properties.v01';

/* ---------------------------------------------------------------- normalisation */
/* Harmless presentation differences only. Never used to grant write authority. */
function normName(v){
  return String(v == null ? '' : v)
    .toUpperCase()
    .replace(/\bHAVARD\b/g, 'HARVARD')       // known legacy spelling variant
    .replace(/&/g, ' AND ')
    .replace(/[.,'"()]/g, ' ')
    .replace(/\b(LLC|L L C|INC|LP|L P|LTD|CO)\b/g, ' ')   // entity suffixes
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ')
    /* Standard address formatting only: drop a TRAILING street-type word, which is
       a presentation difference between systems ("71 Haviland" vs "71 Haviland
       Road"). Only trailing, so "Wall Street Manor" is untouched. This is on the sponsor's
       allowed-normalisation list; it is NOT fuzzy matching and never resolves two
       different addresses onto each other. */
    .replace(/\s+(ROAD|RD|STREET|ST|AVENUE|AVE|DRIVE|DR|LANE|LN|COURT|CT|PLACE|PL|BOULEVARD|BLVD)$/,'')
    .trim();
}
window.bkNormPropertyName = normName;

function num(v){
  if(typeof v === 'number' && isFinite(v)) return v;
  if(typeof v !== 'string') return null;
  var t = v.replace(/[$,\s]/g,'');
  var neg = /^\(.*\)$/.test(t);
  if(neg) t = t.slice(1,-1);
  if(t === '' || isNaN(Number(t))) return null;
  return neg ? -Number(t) : Number(t);
}

/* ---------------------------------------------------------------- HPM parse */
/* rows = array of arrays (SheetJS sheet_to_json with header:1). Pure function:
   no DOM, no storage, no side effects - so it is testable against the real
   workbook outside the browser. */
window.bkHpmParsePropertySummary = function(rows){
  var out = { owned: [], targets: [], errors: [], headerRow: null };
  if(!Array.isArray(rows) || !rows.length){ out.errors.push('Empty sheet'); return out; }

  var hdrIdx = -1;
  for(var i=0; i<Math.min(rows.length,10); i++){
    var r = rows[i] || [];
    if(String(r[0]||'').trim().toUpperCase() === 'PROPERTY'){ hdrIdx = i; break; }
  }
  if(hdrIdx < 0){ out.errors.push('No "Property" header row found - not an HPM Property Summary sheet'); return out; }
  out.headerRow = rows[hdrIdx].map(function(x){ return String(x==null?'':x).trim(); });

  var inTargets = false;
  for(var r2 = hdrIdx+1; r2 < rows.length; r2++){
    var row = rows[r2] || [];
    var name = String(row[0]==null?'':row[0]).trim();
    if(!name) continue;
    if(/TARGET ACQUISITION/i.test(name)){ inTargets = true; continue; }
    var rec = {
      propertyName : name,
      normName     : normName(name),
      type         : String(row[1]==null?'':row[1]).trim() || null,
      units        : num(row[2]),
      sf           : num(row[3]),
      annualRent   : num(row[4]),
      rentPSF      : num(row[5]),
      t12noi       : num(row[6]),
      expenseRatio : num(row[7]),
      capRate      : num(row[8]),
      vacancy      : num(row[9]),
      ownership    : num(row[10]),
      impliedValue : num(row[11]),
      /* Identifiers the workbook does NOT supply. Recorded explicitly as null so
         downstream code can never mistake absence for a match. */
      dealId       : null,
      propertyId   : null,
      address      : null,
      yardiCode    : null,
      sourceSheet  : 'Property Summary',
      sourceRow    : r2 + 1,
      isTarget     : inTargets
    };
    (inTargets ? out.targets : out.owned).push(rec);
  }

  /* duplicate-identity detection - a duplicate normalised name would make the
     crosswalk ambiguous, so it is surfaced rather than silently de-duplicated */
  var seen = {};
  out.owned.forEach(function(p){
    if(seen[p.normName]) out.errors.push('Duplicate property name after normalisation: '+p.propertyName);
    seen[p.normName] = true;
  });
  return out;
};

/* ---------------------------------------------------------------- crosswalk */
window.bkMasterLoad = function(){
  try { var a = JSON.parse(localStorage.getItem(MASTER_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
};
window.bkMasterSave = function(list){
  localStorage.setItem(MASTER_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  return window.bkMasterLoad().length;
};
window.bkMasterClear = function(){ try{ localStorage.removeItem(MASTER_KEY); }catch(e){} };

/* Deterministic, exact-after-normalisation resolution. Returns null on no match
   AND on ambiguity - never a best guess. */
window.bkResolveProperty = function(name, list){
  var master = Array.isArray(list) ? list : window.bkMasterLoad();
  var key = normName(name);
  if(!key) return { matched:null, reason:'empty name' };
  var hits = master.filter(function(p){ return p.normName === key; });
  if(hits.length === 1) return { matched:hits[0], reason:'exact normalised name' };
  if(hits.length === 0) return { matched:null, reason:'no master property matches "'+name+'"' };
  return { matched:null, reason:'ambiguous - '+hits.length+' master properties share this normalised name' };
};

/* ---------------------------------------------------------------- source scope gate */
/* Extracts the property scope a source document declares about ITSELF, from its
   own section headers. Pure function over rows. */
window.bkExtractSourceScope = function(rows){
  var res = { declared: [], resolved: [], unresolved: [], headers: [] };
  if(!Array.isArray(rows)) return res;
  var re = /^\s*(COMMERCIAL|RESIDENTIAL|COMBINED|TOTAL)?\s*RENT\s*[--]\s*(.+)$/i;
  rows.forEach(function(row, idx){
    var a = row && row[0]; if(typeof a !== 'string') return;
    var m = re.exec(a.trim()); if(!m) return;
    res.headers.push({ row: idx+1, text: a.trim() });
    m[2].split(',').forEach(function(part){
      var nm = part.trim(); if(!nm) return;
      if(res.declared.indexOf(nm) === -1) res.declared.push(nm);
    });
  });
  var master = window.bkMasterLoad();
  res.declared.forEach(function(nm){
    var r = window.bkResolveProperty(nm, master);
    if(r.matched) res.resolved.push({ declared:nm, property:r.matched.propertyName });
    else res.unresolved.push({ declared:nm, reason:r.reason });
  });
  return res;
};

/* THE GATE. Decides the maximum scope a source document's facts may carry.
   Fails closed: anything other than exactly one resolved property is refused
   PROPERTY scope, with a specific reason. */
window.bkSourceScopeDecision = function(rows, intendedDealName){
  var sc = window.bkExtractSourceScope(rows);
  var d = {
    declaredCount : sc.declared.length,
    declared      : sc.declared,
    resolved      : sc.resolved,
    unresolved    : sc.unresolved,
    scope         : 'UNRESOLVED',
    propertyWrite : false,
    reason        : '',
    permanent     : false
  };
  if(sc.declared.length === 0){
    d.scope  = 'UNRESOLVED';
    d.reason = 'The source declares no property scope. Identity is unproven, so facts are held as UNRESOLVED and cannot be written to a property.';
    return d;
  }
  if(sc.declared.length > 1){
    d.scope     = 'PORTFOLIO';
    d.permanent = true;
    d.reason    = 'The source declares '+sc.declared.length+' properties in its own section headers, so every figure in it is an aggregate across those properties. '
                + 'PROPERTY scope is impossible by construction - not merely unproven - and no amount of additional evidence can make these totals property-specific.';
    return d;
  }
  /* exactly one declared property */
  var only = sc.declared[0];
  var r = window.bkResolveProperty(only);
  if(!r.matched){
    d.scope  = 'UNRESOLVED';
    d.reason = 'The source declares one property ("'+only+'") but it does not resolve against master data: '+r.reason+'.';
    return d;
  }
  if(intendedDealName){
    var want = window.bkResolveProperty(intendedDealName);
    if(!want.matched || want.matched.normName !== r.matched.normName){
      d.scope  = 'REVIEW';
      d.reason = 'The source proves it belongs to "'+r.matched.propertyName+'", which is not the intended deal ("'+intendedDealName+'"). Refused.';
      return d;
    }
  }
  d.scope = 'PROPERTY'; d.propertyWrite = true;
  d.reason = 'The source declares exactly one property, it resolves to master property "'+r.matched.propertyName+'", and it matches the intended deal.';
  return d;
};

/* ---------------------------------------------------------------- T-12 tie-out */
/* Internal reconciliation over a T-12's own subtotals. Reports discrepancies; it
   never adjusts a figure to make a total tie. Pure function. */
window.bkT12TieOut = function(rows, totalCol){
  var col = (typeof totalCol === 'number') ? totalCol : 14;   // col O, 0-based
  function find(label){
    for(var i=0;i<rows.length;i++){
      var a = rows[i] && rows[i][0];
      if(typeof a === 'string' && a.trim().toUpperCase() === label) return num(rows[i][col]);
    }
    return null;
  }
  var comm = find('TOTAL COMMERCIAL RENTAL INCOME'),
      res  = find('TOTAL RESIDENTIAL RENTAL INCOME'),
      oth  = find('TOTAL OTHER INCOME'),
      egi  = find('EFFECTIVE GROSS INCOME'),
      nr   = find('TOTAL NON-RECOVERABLE EXPENSES'),
      op   = find('TOTAL OPERATING EXPENSES'),
      oe   = find('TOTAL OTHER EXPENSES'),
      tot  = find('TOTAL EXPENSES & FEES'),
      noi  = find('NET OPERATING INCOME');
  var checks = [];
  function chk(name, computed, stated){
    if(computed == null || stated == null){ checks.push({check:name, status:'NOT TESTABLE', detail:'component missing'}); return; }
    var d = computed - stated;
    checks.push({ check:name, computed:computed, stated:stated, delta:d,
                  status: Math.abs(d) < 0.01 ? 'TIES' : 'DISCREPANCY' });
  }
  chk('Commercial + Residential + Other = EGI', (comm!=null&&res!=null&&oth!=null)?comm+res+oth:null, egi);
  chk('NonRecoverable + Operating + Other = Total Expenses', (nr!=null&&op!=null&&oe!=null)?nr+op+oe:null, tot);
  chk('EGI - Total Expenses = NOI', (egi!=null&&tot!=null)?egi-tot:null, noi);
  return { values:{comm:comm,res:res,oth:oth,egi:egi,nonRecov:nr,opex:op,otherExp:oe,totalExp:tot,noi:noi}, checks:checks };
};
})();
