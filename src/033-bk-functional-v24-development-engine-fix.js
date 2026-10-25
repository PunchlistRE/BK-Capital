
/* Punchlist Capital V2.4 -- fixes two real, pre-existing defects in the Development engine, both
   discovered while building V23's Data Export and neither introduced by this app's work this
   session (both are present even in the original V5.4 upload this whole build started from).
   Acquisition deals (Havard, Meridian) are completely untouched by either fix -- both only ever
   affect dealType='Development'. This is a narrow, surgical fix, not a rewrite: the acquisition
   engine and every rendered sheet's markup are unchanged, and no new financial assumptions or
   parallel calculations are introduced anywhere in this block.

   FIX 1 -- bkOperatingV02() restored. It was referenced three times (bkDevFundingV10,
   bkDevTakeoutV11, bkDevMonthlyReturnsV12) but never defined anywhere, so any real development
   deal threw a ReferenceError immediately. Restored here as a direct port of the Excel master's
   own STABILIZED VALUE formula (workbook tab "Debt", cell C8: "=IF(k_ExitCap>0,o_NOIar/k_ExitCap,0)"),
   confirmed to be the SAME formula Excel uses for both acquisition debt sizing ("Sizing 1 - Max
   LTV x Stabilized Value", Debt!C11) and construction-facility sizing ("Commitment at Max
   Loan-to-Stabilized-Value", Debt!C27) -- one shared Operating Underwrite authority feeding every
   LTV-based debt constraint in the workbook, not a separate development-only calculation. Excel's
   o_NOIar ("NOI After Reserves") is exactly bkCalc().after in this app -- the same already-verified
   Year-1 stabilized operating pro forma Operating Underwrite, Property CF and acquisition Debt
   sizing already all read from. So this isn't new math: it's wiring the app's own existing
   operating engine into the development debt-sizing chain the same way Excel wires Operating
   Underwrite into Debt, for both deal types.

   FIX 2 -- bkMonthlyReturns() dealType routing restored. V12 (development-return bridge)
   originally routed development deals to bkDevMonthlyReturnsV12(); V15 (a later acquisition-only
   rewrite, "exact monthly levered CF") reassigned bkMonthlyReturns again without carrying that
   branch forward, and because later assignments win in this file's additive-patch pattern, every
   real caller (Waterfall, Sponsor CF, Investors, Data Export) was silently running
   acquisition-shaped math against development deals with no error at all -- more dangerous than
   Fix 1's clean crash. Fixed properly, not by wrapping today's bkMonthlyReturns (which would risk
   recursion and add yet another patch layer): V1.5's script block above now assigns its
   implementation to window.bkAcquisitionMonthlyReturnsV15 instead of window.bkMonthlyReturns --
   its function body is byte-for-byte unchanged, so the verified Havard/Meridian numbers cannot
   move. V12's own now-redundant router line (which V15 always overrode anyway, so it was already
   dead weight) has been removed from the V12 block above. This is the one, final, permanent
   router -- nothing after this point in the file reassigns bkMonthlyReturns again. */

function bkOperatingV02(){
  const c = bkCalc(); // the app's own already-verified Year-1 stabilized operating pro forma
  const s = bkLoad();
  const noiAfterReserves = c.after;                          // Excel's o_NOIar
  const exitCap = Number(s.exitCap||0);
  const impliedValue = exitCap>0 ? noiAfterReserves/exitCap : 0; // Excel Debt!C8: o_NOIar / k_ExitCap
  return {noi: noiAfterReserves, impliedValue};
}
window.bkOperatingV02 = bkOperatingV02;

window.bkMonthlyReturns = function(){
  const s = bkLoad();
  return String(s.dealType||'').toLowerCase()==='development'
    ? bkDevMonthlyReturnsV12()
    : bkAcquisitionMonthlyReturnsV15();
};
