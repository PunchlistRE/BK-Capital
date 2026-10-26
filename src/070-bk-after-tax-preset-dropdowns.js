
(function(){
  const presets = {
    "Ordinary Income Tax Rate": [
      ["0","0.00%"],["0.12","12.00%"],["0.22","22.00%"],["0.24","24.00%"],
      ["0.32","32.00%"],["0.35","35.00%"],["0.37","37.00%"]
    ],
    "Land Value (% of Basis)": [
      ["0","0.00%"],["0.10","10.00%"],["0.15","15.00%"],["0.20","20.00%"],
      ["0.25","25.00%"],["0.30","30.00%"]
    ],
    "Depreciable Life": [
      ["27.5","27.5 years"],["39","39 years"]
    ],
    "Depreciation Recapture Rate": [
      ["0","0.00%"],["0.25","25.00%"]
    ],
    "Long-Term Capital Gains Rate": [
      ["0","0.00%"],["0.15","15.00%"],["0.20","20.00%"]
    ]
  };

  function enhance(){
    const root = document.getElementById("viewport");
    if(!root) return;
    root.querySelectorAll("table tr").forEach(tr=>{
      const cells = tr.querySelectorAll("td");
      if(cells.length < 2) return;
      const label = (cells[0].textContent||"").trim();
      if(!presets[label] || cells[1].querySelector("select")) return;

      const old = cells[1].querySelector("input");
      if(!old) return;

      const sel = document.createElement("select");
      sel.className = old.className;
      sel.style.cssText = old.style.cssText;
      sel.style.width = "118px";
      sel.style.minWidth = "118px";
      sel.style.maxWidth = "118px";
      sel.style.boxSizing = "border-box";

      presets[label].forEach(([v,t])=>{
        const o=document.createElement("option");
        o.value=v; o.textContent=t; sel.appendChild(o);
      });

      let current = String(old.value ?? "");
      let num = Number(current.replace(/[%,$]/g,""));
      if(current.includes("%")) num /= 100;
      let best = Array.from(sel.options).find(o => Math.abs(Number(o.value)-num) < 1e-9);
      if(best) sel.value=best.value;

      // Preserve the canonical state write path by updating the original input and
      // dispatching the same events its existing listeners/inline handlers consume.
      sel.addEventListener("change", ()=>{
        old.value = sel.value;
        old.dispatchEvent(new Event("input",{bubbles:true}));
        old.dispatchEvent(new Event("change",{bubbles:true}));
      });

      old.style.display="none";
      old.insertAdjacentElement("afterend",sel);
    });
  }

  function boot(){
    enhance();
    window.bkDisplayPass(()=>requestAnimationFrame(enhance));
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
