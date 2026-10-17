const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path=require('path');
(async()=>{
  const deal=require(path.resolve(process.argv[4]||path.join(__dirname,'deal.js')));
  const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  const p=await b.newPage();
  await p.route(/supabase\.co|vercel\.app|fonts\.g/,r=>r.abort());
  await p.goto('file://'+path.resolve(process.argv[2])); await p.waitForTimeout(1200);
  const out=await p.evaluate((deal)=>{
    bkCreateNewDeal(deal);
    const s=bkLoad(); const u=bkAnnualCF(); const d=bkDebt(); const x=bkMonthlyReturns(); const w=bkWaterfallV07();
    const strip=o=>JSON.parse(JSON.stringify(o,(k,v)=>(k==='s'||k==='x'||k==='u'||k==='d')?undefined:v));
    return {s:strip(s), calc:bkCalc(), u:strip(u), d:{loan:d.loan,fee:d.fee,pmt:d.pmt,basis:d.basis,stab:d.stab,byLTV:d.byLTV,byLTC:d.byLTC,byDSCR:d.byDSCR,equity:d.equity,debtAtSale:d.debtAtSale,months:d.months},
      x:strip(x), w:strip(w), acqFee:bkAcqFeePct(s)};
  },deal);
  require('fs').writeFileSync(process.argv[3],JSON.stringify(out));
  await b.close();
})();
