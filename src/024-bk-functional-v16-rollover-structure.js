
/* Punchlist Capital V1.6 - Stage C data structure: lease start/end dates, global rollover
   assumptions (with per-unit override), and a read-only Rollover Schedule preview.
   STRUCTURE ONLY: nothing here changes bkAnnualCF's revenue calculation yet, so the
   verified Havard/Meridian NOI, IRR and MOIC figures are untouched. This just gives the
   rollover engine (not yet built) somewhere correct to read its inputs from, and gives BK
   a way to see which leases the engine will need to handle before that engine exists. */

function bkEnsureV16(){
  const s = bkLoad(); let dirty=false;
  if(!s.rolloverAssumptions || typeof s.rolloverAssumptions!=='object'){
    s.rolloverAssumptions = {renewalProbability:0.65, downtimeMonths:6, tiNewPerSF:20, tiRenewalPerSF:5, lcNewPct:0.06, lcRenewalPct:0.03};
    dirty=true;
  }
  if(dirty) bkSave(s);
  return s;
}
window.bkEnsureV16 = bkEnsureV16;

window.bkSetRollover = function(key, el){
  const s=bkEnsureV16();
  let v = el && el.textContent!==undefined ? el.textContent : '';
  const isPct = (key==='renewalProbability'||key==='lcNewPct'||key==='lcRenewalPct');
  v = String(v).replace(/[%,$]/g,'').trim();
  v = parseFloat(v)||0;
  if(isPct) v = v/100;
  s.rolloverAssumptions = Object.assign({}, s.rolloverAssumptions, {[key]:v});
  bkSave(s); showSheet(currentSheet);
};

// Merge global rollover assumptions with a unit's own override (if any) -- shallow merge,
// override wins per-key. Used by both the schedule preview below and, later, the engine.
window.bkRolloverFor = function(unit, s){
  s = s || bkEnsureV16();
  const base = s.rolloverAssumptions || {};
  const ov = (unit && unit.rolloverOverride && typeof unit.rolloverOverride==='object') ? unit.rolloverOverride : {};
  return Object.assign({}, base, ov);
};

// Operating month (1 = first month of the hold) that a lease end date falls in, relative
// to the deal's closing date. Same convention bkAnnualCF/bkDebt already use for month 1.
window.bkLeaseRolloverMonth = function(leaseEndStr, closingStr){
  if(!leaseEndStr) return null;
  const end = bkParseDealDate(leaseEndStr,null), close = bkParseDealDate(closingStr,'2026-01-01');
  // bkParseDealDate returns null (not an Invalid Date) for an unrecognised string, which is
  // the same "cannot be determined" outcome this guard already produced -- so an unparseable
  // lease end still yields null here rather than a guessed rollover month.
  if(!end || !close || isNaN(end.getTime()) || isNaN(close.getTime())) return null;
  return (end.getFullYear()-close.getFullYear())*12 + (end.getMonth()-close.getMonth()) + 1;
};

// bkRRAdd re-override: same as V13's, plus the two new date fields default to blank.
window.bkRRAdd = function(){
  const s=bkLoad(); const rr=Array.isArray(s.rentRoll)?s.rentRoll.slice():[];
  rr.push({unitId:'New Unit',sf:0,tenantType:'Commercial',status:'Occupied',inPlaceRent:0,marketRent:0,recovery:0,leaseStart:'',leaseEnd:''});
  s.rentRoll=rr; bkSave(s); showSheet(currentSheet);
};

// Per-unit rollover override: cell holds compact JSON (e.g. {"renewalProbability":0.85,
// "downtimeMonths":3,"tiRenewalPerSF":4}), blank = no override (use the global assumptions).
// Invalid JSON is left uncommitted (the cell keeps showing what's actually saved) rather
// than silently discarding what BK typed or throwing a blocking browser dialog.
window.bkRRSetOverride = function(idx, el){
  const s=bkLoad(); const rr=Array.isArray(s.rentRoll)?s.rentRoll.slice():[];
  if(!rr[idx]) return;
  const text = (el?el.textContent:'').trim();
  let ok = true, parsed = undefined;
  if(text===''){ parsed = undefined; }
  else { try{ parsed = JSON.parse(text); if(typeof parsed!=='object'||Array.isArray(parsed)) throw 0; } catch(e){ ok=false; } }
  if(!ok){ el.dataset.bkInvalid='1'; return; }
  el.dataset.bkInvalid='0';
  const next = Object.assign({}, rr[idx]);
  if(parsed===undefined) delete next.rolloverOverride; else next.rolloverOverride = parsed;
  rr[idx] = next; s.rentRoll = rr; bkSave(s); showSheet(currentSheet);
};

const _rrV16 = RENDERERS['Rent Roll'];
RENDERERS['Rent Roll'] = function(){
  const o = _rrV16();
  const s = bkEnsureV16(); const rr = Array.isArray(s.rentRoll)?s.rentRoll:[];
  const ra = s.rolloverAssumptions;
  const pct = n => (Number(n)*100).toFixed(2)+'%';

  // Extra columns (Lease Start / Lease End / Override) appended onto the existing V13
  // detail table via a second table, rather than reflowing the original -- keeps this
  // patch additive and leaves the V13 table (and its onblur handlers) untouched.
  const leaseRows = rr.map((u,i)=>{
    const mo = bkLeaseRolloverMonth(u.leaseEnd, s.closing);
    const holdMonths = Math.max(1,Math.round(Number(s.holdYears)||10))*12;
    const inHold = (mo!==null && mo>=1 && mo<=holdMonths);
    const flag = !u.leaseEnd ? '<span class="status-chip">no lease end</span>'
      : inHold ? `<span class="status-chip warn">rolls @ mo ${mo}</span>`
      : `<span class="status-chip pass">past hold (mo ${mo})</span>`;
    const ovText = u.rolloverOverride ? bkEsc(JSON.stringify(u.rolloverOverride)) : '';
    const recActive = bkRecoveryActive(u);
    const recGated = !recActive && (Number(u.recovery)||0) > 0;
    const recChip = u.tenantType!=='Commercial' ? '<span class="status-chip">n/a</span>'
      : recGated ? '<span class="status-chip warn">GATED - no active rent</span>'
      : recActive ? '<span class="status-chip pass">active</span>'
      : '<span class="status-chip">no recovery entered</span>';
    return `<tr>
      <td class="rowlabel">${bkEsc(u.unitId||'')}</td>
      <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSet(${i},'leaseStart',this)">${bkEsc(u.leaseStart||'')}</td>
      <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSet(${i},'leaseEnd',this)">${bkEsc(u.leaseEnd||'')}</td>
      <td>${flag}</td>
      <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSetOverride(${i},this)" title="JSON override, e.g. {&quot;renewalProbability&quot;:0.85,&quot;downtimeMonths&quot;:3}">${ovText}</td>
      <td>${recChip}</td>
      <td><select onchange="bkRRSet(${i},'recoveryOverride',this)" title="Force this unit's recovery to stay active even with no active lease/rent (e.g. a holdover CAM-only obligation). Opt-in only -- never applied automatically.">
        <option value="false" ${u.recoveryOverride!==true?'selected':''}>No</option>
        <option value="true" ${u.recoveryOverride===true?'selected':''}>Yes</option>
      </select></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="rowlabel">No rent roll rows yet.</td></tr>`;

  // Rollover Schedule preview: every occupied unit with a lease end, sorted by when it
  // rolls, showing the EFFECTIVE assumptions (global merged with any per-unit override)
  // that a rollover engine would use. Read-only -- this is a preview of the inputs, not
  // a cash flow result; no engine runs here yet.
  const holdMonths = Math.max(1,Math.round(Number(s.holdYears)||10))*12;
  const schedule = rr
    .map((u,i)=>({u,i,mo:bkLeaseRolloverMonth(u.leaseEnd,s.closing)}))
    .filter(x=>x.u.status==='Occupied' && x.mo!==null)
    .sort((a,b)=>a.mo-b.mo)
    .map(x=>{
      const eff = bkRolloverFor(x.u, s);
      const inHold = x.mo>=1 && x.mo<=holdMonths;
      const rowStyle = inHold ? '' : ' style="opacity:.55"';
      return `<tr${rowStyle}><td class="rowlabel">${bkEsc(x.u.unitId||'')}</td><td>${bkEsc(x.u.sf)} SF</td><td>Mo ${x.mo}${inHold?'':' (past hold)'}</td>
        <td>${pct(eff.renewalProbability)}</td><td>${eff.downtimeMonths} mo</td>
        <td>$${eff.tiNewPerSF}/$${eff.tiRenewalPerSF}</td><td>${pct(eff.lcNewPct)}/${pct(eff.lcRenewalPct)}</td>
        <td>${x.u.rolloverOverride?'<span class="status-chip warn">override</span>':'global'}</td></tr>`;
    }).join('');
  const vacantAtAcq = rr.filter(u=>u.status!=='Occupied').map(u=>`<tr style="opacity:.55"><td class="rowlabel">${bkEsc(u.unitId||'')}</td><td>${bkEsc(u.sf)} SF</td><td colspan="6">Vacant at acquisition (not a rollover)</td></tr>`).join('');

  o.main += `
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Rollover Assumptions - Global (Stage C, structure only - not yet wired into cash flow)</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th></tr></thead><tbody>
      <tr class="input" data-bk-key="renewalProbability"><td class="rowlabel">Renewal Probability</td><td class="input v" contenteditable="true" spellcheck="false" onblur="bkSetRollover('renewalProbability',this)">${pct(ra.renewalProbability)}</td><td>%</td></tr>
      <tr class="input" data-bk-key="downtimeMonths"><td class="rowlabel">Downtime on Non-Renewal</td><td class="input v" contenteditable="true" spellcheck="false" onblur="bkSetRollover('downtimeMonths',this)">${ra.downtimeMonths}</td><td>months</td></tr>
      <tr class="input" data-bk-key="tiNewPerSF"><td class="rowlabel">TI - New Lease</td><td class="input v" contenteditable="true" spellcheck="false" onblur="bkSetRollover('tiNewPerSF',this)">${ra.tiNewPerSF}</td><td>$/SF</td></tr>
      <tr class="input" data-bk-key="tiRenewalPerSF"><td class="rowlabel">TI - Renewal</td><td class="input v" contenteditable="true" spellcheck="false" onblur="bkSetRollover('tiRenewalPerSF',this)">${ra.tiRenewalPerSF}</td><td>$/SF</td></tr>
      <tr class="input" data-bk-key="lcNewPct"><td class="rowlabel">LC - New Lease</td><td class="input v" contenteditable="true" spellcheck="false" onblur="bkSetRollover('lcNewPct',this)">${pct(ra.lcNewPct)}</td><td>% of lease value</td></tr>
      <tr class="input" data-bk-key="lcRenewalPct"><td class="rowlabel">LC - Renewal</td><td class="input v" contenteditable="true" spellcheck="false" onblur="bkSetRollover('lcRenewalPct',this)">${pct(ra.lcRenewalPct)}</td><td>% of lease value</td></tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Lease Dates &amp; Per-Unit Override</caption><thead><tr><th class="rowlabel-h">Unit / Tenant</th><th>Lease Start</th><th>Lease End</th><th>Status</th><th>Rollover Override (JSON, blank = use global)</th><th>Recovery Gate</th><th>Recovery Override (force active)</th></tr></thead><tbody>${leaseRows}</tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Rollover Schedule Preview - effective assumptions per unit, read-only</caption><thead><tr><th class="rowlabel-h">Unit</th><th>SF</th><th>Rolls</th><th>Renewal Prob.</th><th>Downtime</th><th>TI New/Renew</th><th>LC New/Renew</th><th>Source</th></tr></thead><tbody>${schedule || '<tr><td colspan="8" class="rowlabel">No occupied unit has a Lease End date set yet.</td></tr>'}${vacantAtAcq}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Rollover data structure -</b> lease start/end dates, global rollover assumptions, and per-unit JSON overrides are now captured and previewed here. This is the data layer only: the revenue calculation is untouched, so NOI, IRR and MOIC are unchanged by what is entered here. The schedule is not yet wired into the monthly cash flow.</div></div>`;
  return o;
};
