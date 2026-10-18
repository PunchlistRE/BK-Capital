// Visual audit: opens every sheet of the app on a sample deal and checks it renders cleanly, saving a screenshot of each.
//   node audit/visual_audit.js <desk|mob> <acq|dev|biz> [index.html]      (screenshots and <kind>-<mode>.json go to $OUT, default /tmp/visual-audit)
// Flags a sheet that throws, scrolls sideways, clips text, shows undefined/NaN/[object, or renders almost nothing. Screenshots are for a person to review.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs=require('fs');
const A=require(__dirname+'/deal.js'), D=require(__dirname+'/devdeal.js');
const OUT=process.env.OUT||'/tmp/visual-audit'; require('fs').mkdirSync(OUT,{recursive:true});
const mode=process.argv[2]||'desk', kind=process.argv[3]||'acq';
const vp = mode==='desk'?{width:1400,height:900}:{width:390,height:800};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:vp});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
await p.route(/supabase|vercel|fonts/,r=>r.abort());await p.goto('file://'+require('path').resolve(process.argv[4]||'index.html'));await p.waitForTimeout(800);
const sheets=await p.evaluate(()=>GROUPS.filter(g=>!g.hidden).flatMap(g=>g.sheets));
await p.evaluate(([k,a,d])=>{document.documentElement.classList.add('bk-auth-ok');bkCreateNewDeal(k==='dev'?d:a);if(k==='biz')bkBizSeedPunchlist()},[kind,A,D]);
const rep=[];
for(const s of sheets){ errs.length=0;
  await p.evaluate(s=>showSheet(s),s);await p.waitForTimeout(350);
  const m=await p.evaluate(()=>{const v=document.querySelector('#viewport');const vw=document.documentElement.clientWidth;const txt=v.innerText;
    const over=[...v.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>vw+2&&!e.closest('.tbl-wrap,.tabnav-primary,[style*="overflow"]')&&getComputedStyle(e).position!=='fixed'}).length;
    const clipped=[...v.querySelectorAll('td,th,.metric-row .k,.metric-row .v,button,.status-chip,label')].filter(e=>e.scrollWidth>e.clientWidth+2&&['hidden','clip'].includes(getComputedStyle(e).overflowX)).map(e=>e.textContent.trim().slice(0,40));
    const bad=(txt.match(/undefined|NaN|\[object|Infinity|null%|\$NaN/g)||[]);
    const small=[...v.querySelectorAll('td,th,span,div,a,button')].filter(e=>e.children.length===0&&e.textContent.trim()&&parseFloat(getComputedStyle(e).fontSize)<10.5).length;
    return {docOverflow:document.documentElement.scrollWidth-vw,over,clipped:clipped.slice(0,5),nClipped:clipped.length,bad:[...new Set(bad)],small,len:txt.length,h:document.documentElement.scrollHeight}});
  const f=`${OUT}/${kind}-${mode}-${s.replace(/[^A-Za-z0-9]+/g,'_')}.png`;
  await p.screenshot({path:f,fullPage:false});
  rep.push({sheet:s,errs:[...errs],...m});}
fs.writeFileSync(`${OUT}/${kind}-${mode}.json`,JSON.stringify(rep,null,1));
const flag=rep.filter(r=>r.errs.length||r.docOverflow>2||r.nClipped||r.bad.length||r.len<150);
console.log(kind,mode,rep.length,'sheets;',flag.length,'flagged');flag.forEach(r=>console.log(' ',r.sheet,JSON.stringify({e:r.errs.slice(0,2),ov:r.docOverflow,cl:r.nClipped,ex:r.clipped.slice(0,3),bad:r.bad,len:r.len})));
await b.close()})()
