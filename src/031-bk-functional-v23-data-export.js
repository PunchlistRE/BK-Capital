
/* Punchlist Capital V2.3 (frontend) -- Data Export. A real export center, not another calculation sheet:
   every builder below reads directly from the same already-verified live engine functions the
   app's own sheets already call (bkLoad, bkAnnualCF, bkMonthlyReturns, bkDebt, bkWaterfallV07,
   bkSponsorV08, bkInvestorMetrics, bkDevV09, bkDevFundingV10). Nothing here computes a new number
   or a parallel/approximate figure -- it only serializes what those functions already return into
   CSV. "Export Full Deal" downloads every applicable dataset as its own CSV file (browser-native
   multi-file download, staggered so the browser doesn't block them as a popup flood); there is no
   single-archive/zip packaging in this pass since the app has zero external dependencies and adding
   a zip library would be the first one. Polished LP-facing PDF exports and a true Excel round-trip
   are explicitly out of scope here per the sponsor's direction. */

function bkCSVCell(v){
  if(v===null||v===undefined) return '';
  if(v instanceof Date) return isNaN(v.getTime())?'':v.toISOString().slice(0,10);
  if(typeof v==='number'){
    if(!isFinite(v)) return 'N/A';   // V30: an undefined result (e.g. IRR with no sign change) is labelled, never a blank that reads as zero
    v = Math.round(v*1e6)/1e6; // display rounding only -- the underlying computed value elsewhere is untouched
  } else if(typeof v==='object'){
    try{ v = JSON.stringify(v); }catch(e){ v=''; }
  }
  let str = String(v);
  if(/[",\n\r]/.test(str)) str = '"'+str.replace(/"/g,'""')+'"';
  return str;
}
function bkCSVFromRows(headers, rows){
  const lines = [ (headers||[]).map(bkCSVCell).join(',') ];
  (rows||[]).forEach(r=>lines.push((r||[]).map(bkCSVCell).join(',')));
  return lines.join('\r\n');
}
/* V30.0.1 EXPORT DELIVERY. The file contents (BOM + CSV, UTF-8) are unchanged; only how the
   bytes reach the user changed:
   - one user click produces exactly ONE download (Chrome/Safari throttle a page that fires a
     series of downloads; the old Full Deal fired seven from setTimeout, only the first was
     allowed, and the tab was then held in "automatic downloads blocked", which also swallowed
     later single-file clicks);
   - Full Deal is one ZIP built in the page (no library, no network);
   - every attempt reports what happened on the page and leaves a real "Save" link the user
     can click if the browser suppressed the automatic save;
   - the object URL is kept for 2 minutes (Safari can read it after the click returns). */
function bkCSVBytes(csv){ return new TextEncoder().encode('\ufeff'+csv); }
var BK_CRC_TABLE=null;
function bkCrc32(bytes){
  if(!BK_CRC_TABLE){ BK_CRC_TABLE=new Uint32Array(256);
    for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); BK_CRC_TABLE[n]=c>>>0; } }
  var crc=0xFFFFFFFF; for(var i=0;i<bytes.length;i++) crc=BK_CRC_TABLE[(crc^bytes[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
/* Minimal ZIP writer: STORE (no compression), UTF-8 names (flag bit 11), standard local headers,
   central directory and end record. Readable by Windows Explorer, macOS Archive Utility, Excel. */
function bkZip(files){
  var enc=new TextEncoder(), parts=[], central=[], offset=0, d=new Date();
  var dosTime=((d.getHours()<<11)|(d.getMinutes()<<5)|(Math.floor(d.getSeconds()/2)))&0xFFFF;
  var dosDate=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  files.forEach(function(f){
    var name=enc.encode(f.name), data=f.bytes, crc=bkCrc32(data);
    var lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true);
    lh.setUint16(10,dosTime,true); lh.setUint16(12,dosDate,true); lh.setUint32(14,crc,true);
    lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,name.length,true); lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),name,data);
    var ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,0,true);
    ch.setUint16(12,dosTime,true); ch.setUint16(14,dosDate,true); ch.setUint32(16,crc,true);
    ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,name.length,true);
    ch.setUint16(30,0,true); ch.setUint16(32,0,true); ch.setUint16(34,0,true); ch.setUint16(36,0,true); ch.setUint32(38,0,true);
    ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),name);
    offset+=30+name.length+data.length;
  });
  var cdSize=central.reduce(function(a,p){ return a+p.length; },0);
  var end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true);
  end.setUint32(12,cdSize,true); end.setUint32(16,offset,true);
  return new Blob(parts.concat(central,[new Uint8Array(end.buffer)]),{type:'application/zip'});
}
function bkExportStatus(kind, html){
  var el=document.getElementById('bk-export-status');
  if(el){ el.className='note-flag bk-export-'+kind; el.style.display=''; el.innerHTML='<span>'+(kind==='err'?'&#9888;':'&#10003;')+'</span><div>'+html+'</div>'; }
  else if(kind==='err'){ try{ window.alert(html.replace(/<[^>]+>/g,'')); }catch(e){} }
}
var bkLastExportUrl=null;
/* Deliver ONE file from the current user click. Throws on failure. */
function bkDeliverFile(filename, blob){
  if(!filename) throw new Error('No file name for this dataset.');
  if(!(blob instanceof Blob) || !blob.size) throw new Error('The file is empty.');
  /* Each file keeps its own object URL for 2 minutes. A URL is never revoked early by a later
     click, so rapid successive exports cannot cancel one another. */
  var url=URL.createObjectURL(blob); bkLastExportUrl=url;
  var a=document.createElement('a');
  a.href=url; a.download=filename; a.rel='noopener'; a.style.display='none';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} if(bkLastExportUrl===url) bkLastExportUrl=null; }, 120000);
  return url;
}
function bkExportDone(filename, url, detail){
  bkExportStatus('ok','<b>Download started: '+bkEsc(filename)+'</b> ('+detail+'). '
    +'If no file appeared, <a href="'+url+'" download="'+bkEsc(filename)+'">click here to save it</a>. '
    +'If the browser still blocks it, allow downloads for this site (Chrome: address bar &rarr; site settings &rarr; Automatic downloads).');
}
function bkDownloadCSV(filename, csv){
  return bkDeliverFile(filename, new Blob([bkCSVBytes(csv)],{type:'text/csv;charset=utf-8'}));
}
function bkSlug(s){ return (String(s||'Deal').replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'')) || 'Deal'; }

function bkExportAssumptions(){
  const s = bkLoad();
  const rows = Object.keys(s).filter(k=>{
    const v = s[k];
    return v===null || typeof v==='string' || typeof v==='number' || typeof v==='boolean';
  }).sort().map(k=>[k, s[k]]);
  return {name:'Assumptions', filename:bkSlug(s.name)+'_Assumptions.csv', headers:['Field','Value'], rows, count:rows.length, available:rows.length>0};
}
function bkExportRentRoll(){
  const s = bkLoad(); const rr = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  const keys = [];
  rr.forEach(u=>Object.keys(u||{}).forEach(k=>{ if(!k.startsWith('_') && keys.indexOf(k)<0) keys.push(k); }));
  const rows = rr.map(u=>keys.map(k=>u[k]));
  return {name:'Rent Roll', filename:bkSlug(s.name)+'_RentRoll.csv', headers:keys, rows, count:rr.length, available:rr.length>0, note:'No rent roll on this deal.'};
}
function bkExportAnnualCF(){
  const s = bkLoad(), x = bkAnnualCF();
  const headers = ['Year','EGI','Total Expenses','NOI Before Reserves','Reserves','NOI After Reserves'];
  const rows = x.arr.map(a=>[a.y, a.egi, a.expenses, a.noi, (a.noi-a.after), a.after]);
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['Initial Acquisition Basis', x.initial]);
  rows.push(['Gross Sale Price', x.grossSale]);
  rows.push(['Cost of Sale', -x.saleCost]);
  rows.push(['Net Sale Proceeds', x.netSale]);
  rows.push(['Unlevered IRR', x.irr]);
  rows.push(['Unlevered MOIC', x.moic]);
  return {name:'Annual Property CF', filename:bkSlug(s.name)+'_Annual_PropertyCF.csv', headers, rows, count:x.arr.length, available:true};
}
function bkExportMonthlyCF(){
  const s = bkLoad(), x = bkMonthlyReturns();
  const isDev = !!(x.rows[0] && 'equityDraw' in x.rows[0]);
  const headers = isDev
    ? ['Month','Year','Date','EGI','NOI','Debt Service','Asset Mgmt Fee','Refi Proceeds','Refi Equity Shortfall','Equity Draw','Sale Proceeds','Debt Payoff','Net Cash Flow']
    : ['Month','Year','Date','EGI','NOI','Reserves','Debt Service','Asset Mgmt Fee','Sale Proceeds','Debt Payoff','Net Cash Flow'];
  const rows = x.rows.map(r=> isDev
    ? [r.m, r.y, r.dt, r.egi, r.noi, r.ds, r.assetFee, r.refi, r.refiEq, r.equityDraw, r.sale, r.payoff, r.cf]
    : [r.m, r.y, r.dt, r.egi, r.noi, r.reserve, r.ds, r.assetFee, r.sale, r.payoff, r.cf]);
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['Levered IRR', x.irr]); rows.push(['Levered MOIC', x.moic]);
  return {name:'Monthly Property CF', filename:bkSlug(s.name)+'_Monthly_PropertyCF.csv', headers, rows, count:x.rows.length, available:true};
}
function bkExportDebtSchedule(){
  const s = bkLoad(), d = bkDebt();
  const headers = ['Month','Beginning Balance','Payment','Interest','Principal','Ending Balance'];
  const rows = d.months.map((m,i)=>[m.m, i? d.months[i-1].balance : d.loan, m.payment, m.interest, m.principal, m.balance]);
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['Loan Amount', d.loan]); rows.push(['Origination Fee', d.fee]); rows.push(['Rate', d.s.acqRate]);
  rows.push(['Amortization (yrs)', d.s.acqAmort]); rows.push(['Going-In DSCR', d.dscr]);
  rows.push(['LTV', d.ltv]); rows.push(['LTC', d.ltc]); rows.push(['Binding Constraint', d.binding]);
  rows.push(['Debt at Sale', d.debtAtSale]);
  return {name:'Debt Schedule', filename:bkSlug(s.name)+'_Debt_Schedule.csv', headers, rows, count:d.months.length, available:true};
}
function bkExportWaterfall(){
  const s = bkLoad(), w = bkWaterfallV07();
  const headers = ['Month','Date','Contribution','Distribution Available','Tier 1 (Pref)','GP Catch-Up','Tier 2','Tier 3','Tier 4','LP Contribution','GP Contribution','LP Distribution','GP Distribution','Promote','LP Net CF','GP Net CF'];
  const rows = w.rows.map(r=>[r.m, r.dt, r.con, r.dist, r.t1, r.catchup, r.t2, r.t3, r.t4, -r.lpCon, -r.gpCon, r.lpDist, r.gpDist, r.promote, r.lpCF, r.gpCF]);
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['LP XIRR', w.lpIRR]); rows.push(['GP XIRR', w.gpIRR]);
  rows.push(['LP MOIC', w.lp.moic]); rows.push(['GP MOIC', w.gp.moic]);
  rows.push(['Total Promote', w.promote]);
  return {name:'Waterfall / LP-GP CF', filename:bkSlug(s.name)+'_Waterfall_LPGP_CF.csv', headers, rows, count:w.rows.length, available:true};
}
function bkExportSponsorCF(){
  const s = bkLoad(), x = bkSponsorV08();
  const headers = ['Month','Date','Acquisition Fee','Asset Mgmt Fee','Disposition Fee','Total Fees','GP Net Equity CF','Sponsor Net CF'];
  const rows = x.rows.map(r=>[r.m, r.dt, r.acqFee, r.amFee, r.dispFee, r.fees, r.gpCF, r.sponsorCF]);
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['Sponsor All-In XIRR', x.sponsorIRR]); rows.push(['Sponsor Equity Multiple', x.sponsorMOIC]);
  rows.push(['Total Fee Income', x.totalFees]); rows.push(['GP Co-Investment', x.gpContrib]);
  rows.push(['GP Distributions', x.gpDist]); rows.push(['Total Promote', x.promote]);
  rows.push(['Total Sponsor Profit', x.sponsorProfit]);
  return {name:'Sponsor CF', filename:bkSlug(s.name)+'_Sponsor_CF.csv', headers, rows, count:x.rows.length, available:true};
}
function bkExportDevSchedule(){
  const s = bkLoad(), isDev = String(s.dealType||'').toLowerCase().includes('develop');
  if(!isDev) return {name:'Development Schedule', filename:bkSlug(s.name)+'_Dev_Schedule.csv', headers:[], rows:[], count:0, available:false, note:'Acquisition deal -- no development schedule.'};
  const x = bkDevV09();
  const headers = ['Phase','Start Month','End Month','Duration (Months)'];
  const rows = x.phases.map(p=>[p[0], p[1], p[2], p[3]]);
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['Total Hold (Months)', x.hold]); rows.push(['Pre-Development (Months)', x.preMo]);
  rows.push(['Construction (Months)', x.conMo]); rows.push(['Lease-Up (Months)', x.luMo]);
  rows.push(['Land / Purchase Price', x.land]); rows.push(['Hard Costs', x.hard]);
  rows.push(['Soft Costs', x.soft]); rows.push(['Unlevered All-In Cost', x.unlev]);
  return {name:'Development Schedule', filename:bkSlug(s.name)+'_Dev_Schedule.csv', headers, rows, count:x.phases.length, available:true};
}
function bkExportDevDraws(){
  const s = bkLoad(), isDev = String(s.dealType||'').toLowerCase().includes('develop');
  if(!isDev) return {name:'Development Draws', filename:bkSlug(s.name)+'_Dev_Draws.csv', headers:[], rows:[], count:0, available:false, note:'Acquisition deal -- no development draws.'};
  const x = bkDevFundingV10();
  const headers = ['Month','Land','Hard Cost','Soft Cost','Lease Deficit','Fees','Funding Need','Equity','Beginning Balance','Capitalized Interest','Excess Interest','Facility Draw','Overflow','Ending Balance','Cumulative Need'];
  /* V30.2: after the permanent takeout (stabilization month) the construction balance is 0. */
  const takeout = Number(x.s && x.s.refiAtStab || 0) ? Number(x.stab||0) : Infinity;
  const rows = x.months.map(m=>{ const off = m.mo > takeout; return [m.mo, m.land, m.hard, m.soft, m.lease, m.fees, m.need, m.eq, off?0:m.beg, m.capInt, m.excess, m.loanDraw, m.overflow, off?0:m.end, m.cumNeed]; });
  rows.push([]); rows.push(['--- SUMMARY ---']);
  rows.push(['Construction Commitment', x.commit]); rows.push(['Upfront Fees', x.upfrontFees]);
  rows.push(['Actual Capitalized Interest', x.actualCapInt]); rows.push(['Levered All-In Cost', x.levered]);
  return {name:'Development Draws', filename:bkSlug(s.name)+'_Dev_Draws.csv', headers, rows, count:x.months.length, available:true};
}

const BK_EXPORT_REGISTRY = [
  {key:'assumptions', label:'Assumptions', desc:'All scalar deal inputs from Deal Underwrite and related sheets.', builder:bkExportAssumptions},
  {key:'rentroll', label:'Rent Roll', desc:'Unit-level rent roll as entered on the Rent Roll sheet.', builder:bkExportRentRoll},
  {key:'annualcf', label:'Annual Property CF', desc:'Annual unlevered NOI and sale proceeds (Property CF sheet).', builder:bkExportAnnualCF},
  {key:'monthlycf', label:'Monthly Property CF', desc:'Monthly dated levered cash flow (Returns sheet).', builder:bkExportMonthlyCF},
  {key:'debt', label:'Debt Schedule', desc:'Full monthly loan amortisation (Debt Schedule sheet).', builder:bkExportDebtSchedule},
  {key:'waterfall', label:'Waterfall / LP-GP CF', desc:'Monthly hurdle waterfall (Equity Waterfall and Waterfall (M) sheets).', builder:bkExportWaterfall},
  {key:'sponsor', label:'Sponsor CF', desc:'GP fees, co-investment and promote (Sponsor CF sheet).', builder:bkExportSponsorCF},
  {key:'investors', label:'Investor Schedules', desc:'Per-investor monthly cash flow and summary (Investor Registry x deal commitments).', builder:function(){ return window.bkExportInvestorSchedules(); }},
  {key:'devschedule', label:'Development Schedule', desc:'Phase timeline (Dev Schedule sheet). Development deals only.', builder:bkExportDevSchedule},
  {key:'devdraws', label:'Development Draws', desc:'Monthly funding and draw schedule (Dev Draws sheet). Development deals only.', builder:bkExportDevDraws},
];
function bkExportSafeBuild(reg){
  // V30: with no provisioned deal every dataset is unavailable - never export the engine template.
  if(typeof bkIsProvisioned==='function' && !bkIsProvisioned())
    return {name:reg.label, filename:'', headers:[], rows:[], count:0, available:false, note:'No active deal.'};
  // A dataset's builder calls straight into the live engine (bkDevFundingV10 etc.) -- if that
  // engine path itself throws (a pre-existing bug, not a Data Export bug), one broken dataset
  // must not take down the whole export center or silently show wrong numbers. Surface it as a
  // clearly-labeled engine error instead.
  try{ return reg.builder(); }
  catch(e){ return {name:reg.label, filename:'', headers:[], rows:[], count:0, available:false, note:'Engine error -- '+(e&&e.message?e.message:e)}; }
}
window.bkExportOne = function(key){
  try{
    const reg = BK_EXPORT_REGISTRY.find(r=>r.key===key);
    if(!reg) throw new Error('Unknown dataset "'+key+'".');
    const b = bkExportSafeBuild(reg);
    if(!b.available) throw new Error(reg.label+' is not available for this deal'+(b.note?' ('+b.note+')':'')+'.');
    const url = bkDownloadCSV(b.filename, bkCSVFromRows(b.headers, b.rows));
    bkExportDone(b.filename, url, b.count+(b.count===1?' row':' rows'));
    return b.filename;
  }catch(e){ bkExportStatus('err','<b>Export failed.</b> '+bkEsc(e&&e.message?e.message:String(e))+' Nothing was downloaded.'); return null; }
};
/* Full Deal: every AVAILABLE dataset (N/A excluded) as its own CSV inside ONE zip = one download. */
window.bkExportFullDealFiles = function(){
  if(typeof bkIsProvisioned==='function' && !bkIsProvisioned()) throw new Error('No active deal.');
  const items = BK_EXPORT_REGISTRY.map(bkExportSafeBuild).filter(b=>b.available);
  if(!items.length) throw new Error('No dataset is available for this deal.');
  return items.map(b=>({ name:b.filename, bytes:bkCSVBytes(bkCSVFromRows(b.headers, b.rows)), rows:b.count }));
};
window.bkExportFullDeal = function(){
  try{
    const files = window.bkExportFullDealFiles();
    const zipName = bkSlug(bkLoad().name)+'_Full_Deal_Export.zip';
    const url = bkDeliverFile(zipName, bkZip(files));
    bkExportDone(zipName, url, files.length+' CSV file'+(files.length===1?'':'s')+': '+files.map(f=>bkEsc(f.name)).join(', '));
    return zipName;
  }catch(e){ bkExportStatus('err','<b>Full Deal export failed.</b> '+bkEsc(e&&e.message?e.message:String(e))+' Nothing was downloaded.'); return null; }
};

RENDERERS['Data Export'] = function(){
  const s = bkLoad();
  const items = BK_EXPORT_REGISTRY.map(r=>Object.assign({}, r, {data:bkExportSafeBuild(r)}));
  const availCount = items.filter(it=>it.data.available).length;
  const rowsHtml = items.map(it=>{
    const avail = it.data.available;
    const size = avail ? (it.data.count + (it.data.count===1?' row':' rows')) : (it.data.note || 'Not applicable to this deal');
    const btn = avail
      ? `<button type="button" class="status-chip pass" onclick="bkExportOne('${it.key}')">Export CSV</button>`
      : `<button type="button" class="status-chip warn" disabled style="opacity:.55;cursor:not-allowed">N/A</button>`;
    return `<tr><td class="rowlabel">${it.label}<div style="font-size:11px;opacity:.7;margin-top:2px">${it.desc}</div></td><td>${size}</td><td style="font-size:10.5px;word-break:normal;overflow-wrap:normal">${String(it.data.filename||'').replace(/([_.])/g,'$1<wbr>')}</td><td>${btn}</td></tr>`;
  }).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Data Export Center - Active Deal</caption><thead><tr><th class="rowlabel-h">Dataset</th><th>Size</th><th>File Name</th><th>Export</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
  <div style="margin-top:16px"><button type="button" class="status-chip pass" onclick="bkExportFullDeal()">Export Full Deal (${availCount} CSV file${availCount===1?'':'s'}, one ZIP)</button></div>
  <div id="bk-export-status" class="note-flag" style="display:none"></div>
  <div class="note-flag"><span>&#10003;</span><div><b>Export center.</b> Every export reads directly from the same live engine functions the app's own sheets already call -- nothing here is a separate or approximate calculation. Each button downloads one UTF-8 CSV. "Export Full Deal" downloads a single ZIP containing every applicable dataset as its own CSV; datasets marked N/A are not included. Polished LP-facing PDF exports and a true Excel round-trip are intentionally out of scope for this pass.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Export Center</div><div class="metric-list"><div class="metric-row"><span class="k">Active Deal</span><span class="v">${s.name||'-'}</span></div><div class="metric-row"><span class="k">Datasets Available</span><span class="v">${availCount} / ${items.length}</span></div><div class="metric-row"><span class="k">Format</span><span class="v">CSV (UTF-8)</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio &amp; Investors</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Data Export', crumbs:'Portfolio & Investors', desc:'Export the active deal canonical engine outputs as CSV files.', meta:{Property:s.name, Datasets:availCount+' / '+items.length, Format:'CSV', Status:'Live'}, main, sidebar};
};

bkRefreshRailStatus();
