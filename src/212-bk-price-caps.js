/* PRICE AND CAP RATES, one definition for the whole app. What was asked against what is paid, and every cap rate side by side, each named for what it divides:
     listing cap     the broker's printed cap rate (the OM, or typed on Investment > Acquisition)
     T-12 cap        trailing-twelve (in-place) NOI / purchase price
     going-in cap    the underwriting's Year 1 NOI after replacement reserves / purchase price (the investor report's going-in)
     pro forma cap   the broker's pro forma NOI / purchase price (OM only)
     exit cap        the underwriting's sale cap rate
   The asking price and listing cap are the deal's own entries when typed, otherwise the OM's (s._omFacts, saved by Import). Read only. */
(function(){
'use strict';
function num(v){ v = Number(v); return isFinite(v) ? v : 0; }
function has(v){ return v != null && v !== '' && isFinite(Number(v)) && Number(v) !== 0; }
window.bkPriceCaps = function(s, rows){
  s = s || {}; var OF = s._omFacts || {}, price = num(s.purchasePrice), dev = /develop/i.test(String(s.dealType || ''));
  var asking = has(s.askingPrice) ? num(s.askingPrice) : has(OF.askingPrice) ? num(OF.askingPrice) : null, askFrom = has(s.askingPrice) ? 'entered' : asking ? 'OM' : null;
  var listing = has(s.listingCap) ? num(s.listingCap) : OF.capPrinted && has(OF.capPrinted.cur) ? num(OF.capPrinted.cur) : null, listFrom = has(s.listingCap) ? 'entered' : listing ? 'OM' : null;
  var t12 = has(s.t12noi) ? num(s.t12noi) : OF.noi && has(OF.noi.t12) ? num(OF.noi.t12) : OF.noi && has(OF.noi.cur) ? num(OF.noi.cur) : null;
  var t12Lbl = has(s.t12noi) || (OF.noi && has(OF.noi.t12)) ? 'T-12' : 'In-place (OM)';
  var R = rows; if(!R && typeof bkMonthlyReturns === 'function'){ try { R = bkMonthlyReturns().rows; } catch(e){ R = null; } }
  var y1 = Array.isArray(R) && R.length >= 12 ? R.slice(0, 12).reduce(function(t, x){ return t + num(x.noi) - num(x.reserve); }, 0) : null;
  var pf = OF.noi && has(OF.noi.pf) ? num(OF.noi.pf) : null, cap = function(n){ return price && n ? n / price : null; };
  var o = { price:price, asking:asking, askFrom:askFrom, vsAsk:asking && price ? price / asking - 1 : null, askDiff:asking && price ? price - asking : null,
    listing:listing, listFrom:listFrom, t12Noi:t12, t12Lbl:t12Lbl, t12Cap:cap(t12), y1Noi:y1, goingIn:dev ? null : cap(y1), pfNoi:pf, pfCap:cap(pf), exitCap:has(s.exitCap) ? num(s.exitCap) : null, dev:dev };
  o.spreadBps = o.exitCap != null && o.goingIn != null ? Math.round((o.exitCap - o.goingIn) * 10000) : null;
  return o; };
/* the comparison as label / value / note rows, for any table that shows it */
window.bkPriceCapRows = function(o, fmt){
  var M = fmt.money, P = function(v){ return v == null ? '—' : fmt.pct(v); }, out = [];
  out.push(['Asking price', o.asking ? M(o.asking) : 'Not stated', o.askFrom === 'OM' ? 'from the OM' : o.askFrom === 'entered' ? 'entered' : 'enter it on Investment > Acquisition']);
  out.push(['Purchase price', M(o.price), o.asking ? (o.vsAsk === 0 ? 'at the asking price' : (o.vsAsk > 0 ? '+' : '') + (o.vsAsk * 100).toFixed(1) + '% against asking (' + (o.askDiff < 0 ? '-' : '+') + M(Math.abs(o.askDiff)) + ')') : '']);
  out.push(['Listing cap rate', P(o.listing), o.listFrom === 'OM' ? 'as the broker prints it' : o.listFrom === 'entered' ? 'entered' : 'not stated']);
  out.push([o.t12Lbl + ' cap rate', P(o.t12Cap), o.t12Noi ? M(o.t12Noi) + ' NOI / purchase price' : 'no T-12 NOI on the deal']);
  out.push(['Going-in cap rate', o.dev ? 'N/A' : P(o.goingIn), o.dev ? 'a development deal is measured on yield on cost' : o.y1Noi != null ? M(o.y1Noi) + ' underwritten Year 1 NOI after reserves / price' : '']);
  if(o.pfCap != null) out.push(['Pro forma cap rate', P(o.pfCap), M(o.pfNoi) + ' broker pro forma NOI / price']);
  out.push(['Exit cap rate', P(o.exitCap), o.spreadBps != null ? (o.spreadBps >= 0 ? '+' : '') + o.spreadBps + ' bps from going-in' : '']);
  return out; };
})();
