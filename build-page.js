const fs = require('fs'); const path = require('path');
const { SEATS, SCENARIOS, data, CSV, USAGE } = require('./build-hardware.js');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const b64 = Buffer.from(CSV, 'utf8').toString('base64');
// The workbook rides along inside the page, so a single HTML file carries the
// Excel version too -- nothing to fetch, nothing to lose in an email thread.
const XLSX_PATH = path.join(__dirname, 'AscendOS-Hardware-Requirements.xlsx');
const xb64 = fs.existsSync(XLSX_PATH) ? fs.readFileSync(XLSX_PATH).toString('base64') : '';
const U = `${USAGE.low.compass}–${USAGE.high.compass}`;
const I = `${USAGE.low.inspector}–${USAGE.high.inspector}`;
const KEY_SEATS = [100, 200, 400, 600, 840];
const at = (k,n) => data[k][SEATS.indexOf(n)];
const last = k => data[k][data[k].length-1].hi;
const lastLo = k => data[k][data[k].length-1].lo;
const splitAt = (k,b) => { const a=data[k];
  for (let i=1;i<a.length;i++) if (a[i-1][b].mgColocated && !a[i][b].mgColocated) return a[i].seats;
  return a[0][b].mgColocated ? null : 20; };

// A row is worth a second look when the index moves onto its own machine:
// total cores and memory can legitimately FALL there, because one shared box
// had to satisfy the larger demand in every dimension at once.
const splitRows = (rows, key) => { let prev=null;
  return rows.map(r => { const s = prev && r.hi[key] !== prev[key]; prev = r.hi; return s; }); };

function optionTable(scKey, cols, cells, splitKey) {
  const rows = data[scKey], flags = splitRows(rows, splitKey);
  return `<table>
<thead><tr>${cols.map(c=>`<th${c[1]?` class="${c[1]}"`:''}>${c[0]}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r,i)=>`<tr${flags[i]?' class="split"':''}>${cells(r, flags[i]).map((v,j)=>
  `<td${cols[j][1]?` class="${cols[j][1]}"`:''}>${v}</td>`).join('')}</tr>`).join('\n')}
</tbody></table>`;
}

const conc = r => [`${r.lo.concurrent.toFixed(1)} <span class="dash">&ndash;</span> ${r.hi.concurrent.toFixed(1)}`];

const HW_COLS = [['Seats','t'],['Peak concurrent<br><span class="lt">low &ndash; high</span>','rng'],
  ['Web tier','t'],['Index host','t'],['Machines',''],['Total<br>vCPU',''],['Total<br>RAM GB',''],['Index<br>disk GB','']];
const SV_COLS = [['Seats','t'],['Peak concurrent<br><span class="lt">low &ndash; high</span>','rng'],
  ['Peak<br>instances',''],['Warm<br>instances',''],['Peak<br>vCPU',''],['Peak<br>RAM GB',''],['Search index','t']];

const optionPanel = (id, letter, title, blurb, cols, cells, splitKey, foot) => `
<section class="panel" id="p-${id}">
  <h2><span class="badge">${letter}</span>${title}</h2>
  <p class="lede">${blurb}</p>
  ${SCENARIOS.map(sc => `<div class="block">
    <h3>${esc(sc.title)}</h3>
    <p class="sub">${esc(sc.sub)}</p>
    <div class="scroll">${optionTable(sc.key, cols, cells, splitKey)}</div>
  </div>`).join('')}
  <p class="foot">${foot}</p>
</section>`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AscendOS — Hardware Requirements</title>
<style>
 :root{--ink:#151a23;--mut:#5d6675;--fade:#8b93a3;--line:#dee2e9;--bg:#fff;--panel:#f6f8fa;
  --accent:#1f4f8f;--accentb:#e8eef8;--split:#fff4dc;--splitb:#e0b877;--head:#1f4f8f}
 *{box-sizing:border-box}
 body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,sans-serif;
   color:var(--ink);background:var(--bg);-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .wrap{max-width:1180px;margin:0 auto;padding:30px 24px 96px}
 .masthead{border-bottom:2px solid var(--accent);padding-bottom:14px;margin-bottom:20px;
   display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
 h1{font-size:24px;margin:0;letter-spacing:-.02em}
 .for{font-size:13px;color:var(--mut);margin:3px 0 0}
 .meta{font-size:12px;color:var(--fade);text-align:right;line-height:1.5}
 h2{font-size:19px;margin:0 0 6px;letter-spacing:-.01em;display:flex;align-items:center;gap:9px}
 .badge{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;
   border-radius:5px;background:var(--accent);color:#fff;font-size:13px;font-weight:700}
 h3{font-size:14px;margin:26px 0 2px;color:var(--accent)}
 .lede{color:var(--mut);max-width:80ch;margin:0 0 8px;font-size:13.5px}
 .sub{color:var(--fade);font-size:12.5px;margin:0 0 9px}
 .foot{font-size:12px;color:var(--fade);margin:14px 0 0}
 .bar{display:flex;gap:9px;flex-wrap:wrap;margin:0 0 8px}
 .btn{display:inline-block;padding:8px 15px;border-radius:6px;background:var(--accent);color:#fff;
   text-decoration:none;font-weight:600;font-size:13.5px;border:0;cursor:pointer;font-family:inherit}
 .btn.alt{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
 .btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
 .hint{font-size:12px;color:var(--fade);margin:0 0 24px;max-width:80ch}
 #raw{width:100%;height:260px;margin:0 0 20px;font:11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
   border:1px solid var(--line);border-radius:7px;padding:10px;background:var(--panel);color:var(--ink);
   white-space:pre;overflow:auto;resize:vertical}
 #raw[hidden]{display:none}
 .scroll{overflow-x:auto}
 table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
 th,td{padding:4px 9px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
 thead th{background:var(--head);color:#fff;font-weight:600;font-size:10.5px;text-transform:uppercase;
   letter-spacing:.045em;vertical-align:bottom;padding:6px 9px;border-bottom:0}
 .lt{font-weight:400;text-transform:none;letter-spacing:0;font-size:9.5px;opacity:.75}
 th.t,td.t{text-align:left}
 td.t{color:var(--mut);font-size:12px}
 td.rng{color:var(--mut)}
 .dash{color:var(--fade)}
 tbody tr:nth-child(even) td{background:var(--panel)}
 tbody tr.split td{background:var(--split);border-top:1px solid var(--splitb);border-bottom:1px solid var(--splitb);font-weight:600}
 tbody tr:hover td{background:var(--accentb)}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:11px;margin:16px 0 22px}
 .card{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 7px 7px 0;padding:12px 15px;background:var(--panel)}
 .card h4{margin:0 0 3px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);font-weight:600}
 .card .n{font-size:20px;font-weight:700;letter-spacing:-.02em}
 .card p{margin:4px 0 0;font-size:12px;color:var(--mut);line-height:1.45}
 .note{border-left:3px solid var(--accent);background:var(--panel);padding:11px 15px;
   margin:16px 0;font-size:13px;color:var(--mut);max-width:88ch}
 .note b{color:var(--ink)}
 dl{margin:0;font-size:13px;color:var(--mut);max-width:88ch}
 dt{font-weight:600;color:var(--ink);margin-top:12px}
 dd{margin:2px 0 0}
 .panel{display:none}
 .panel.on{display:block}
 /* Worksheet tabs, along the bottom the way a spreadsheet puts them. */
 .tabs{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--line);
   display:flex;gap:2px;padding:0 24px;overflow-x:auto;z-index:9;box-shadow:0 -2px 8px rgba(0,0,0,.05)}
 .tab{border:1px solid var(--line);border-bottom:0;border-radius:6px 6px 0 0;background:var(--panel);
   color:var(--mut);font:600 12.5px/1 inherit;padding:10px 15px;cursor:pointer;white-space:nowrap;
   margin-top:5px;font-family:inherit}
 .tab[aria-selected="true"]{background:var(--bg);color:var(--accent);border-color:var(--line);
   box-shadow:inset 0 3px 0 var(--accent);margin-top:0;padding-top:15px}
 .tab:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
 @media (prefers-color-scheme:dark){
  :root{--ink:#e7ecf3;--mut:#98a1b2;--fade:#727b8c;--line:#2a313f;--bg:#12151c;--panel:#1a1f28;
   --accent:#5b9bf0;--accentb:#1c2635;--split:#33290f;--splitb:#7a6023;--head:#1e3a63}}
 :root[data-theme="dark"]{--ink:#e7ecf3;--mut:#98a1b2;--fade:#727b8c;--line:#2a313f;--bg:#12151c;
   --panel:#1a1f28;--accent:#5b9bf0;--accentb:#1c2635;--split:#33290f;--splitb:#7a6023;--head:#1e3a63}
 :root[data-theme="light"]{--ink:#151a23;--mut:#5d6675;--fade:#8b93a3;--line:#dee2e9;--bg:#fff;
   --panel:#f6f8fa;--accent:#1f4f8f;--accentb:#e8eef8;--split:#fff4dc;--splitb:#e0b877;--head:#1f4f8f}

 /* PRINT: every tab prints, each starting its own page, headers repeating
    across page breaks and no row split down the middle. */
 @page{size:A4 landscape;margin:12mm}
 @media print{
  body{font-size:10px;background:#fff}
  .wrap{max-width:none;padding:0}
  .bar,.hint,#raw,.tabs{display:none!important}
  .panel{display:block!important;page-break-before:always}
  .panel:first-of-type{page-break-before:avoid}
  .masthead{margin-bottom:12px}
  h1{font-size:17px}h2{font-size:14px}h3{font-size:11px;margin:14px 0 2px}
  table{font-size:8.4px}th,td{padding:2px 5px}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  .block{page-break-inside:auto}
  .card{break-inside:avoid}
  .scroll{overflow:visible}
  a{text-decoration:none;color:inherit}
 }
</style></head><body><div class="wrap">

<div class="masthead">
  <div><h1>AscendOS &mdash; Hardware Requirements</h1>
  <p class="for">Prepared for ShiftIT &middot; hardware specification only, no pricing</p></div>
  <div class="meta">Code Compass ${U} searches / seat / day<br>
  Code Inspector ${I} scans / user / day<br>20&ndash;840 seats in steps of 20</div>
</div>

<div class="bar">
  <a class="btn" id="dx" download="AscendOS-Hardware-Requirements.xlsx">Download Excel workbook</a>
  <a class="btn alt" id="dl" download="AscendOS-Hardware-Requirements.csv">Download CSV</a>
  <button class="btn alt" id="pr">Print / save as PDF</button>
  <button class="btn alt" id="cp">Copy CSV</button>
  <button class="btn alt" id="sh">Show raw CSV</button>
</div>
<p class="hint">The Excel workbook has the same five tabs, formatted and ready to send on.
Printing outputs every tab, each starting on its own page, in landscape.
If the download button does nothing, this page is inside a sandbox that blocks downloads &mdash; use
<b>Copy CSV</b> and paste into a blank spreadsheet.</p>
<textarea id="raw" spellcheck="false" hidden></textarea>

<section class="panel on" id="p-summary">
  <h2><span class="badge">&#9632;</span>Summary</h2>
  <p class="lede">The three options are alternatives, not layers &mdash; you would supply one of them.
  Each has its own tab with the full 20-seat detail. Hardware is sized on the high end of the
  usage range; a fleet sized on average usage is under-provisioned on every busy day.</p>

  <div class="cards">
   <div class="card"><h4>840 seats, Compass only</h4><div class="n">${last('compass').mgCpu} vCPU &middot; ${last('compass').mgRam} GB</div>
    <p>${lastLo('compass').concurrent.toFixed(0)}&ndash;${last('compass').concurrent.toFixed(0)} jobs in flight at peak &mdash; ${last('compass').mgMachines} managed instances, or ${last('compass').vpMachines} VPS servers.</p></div>
   <div class="card"><h4>The planning threshold</h4><div class="n">${splitAt('compass','hi')} seats</div>
    <p>Where the search index needs its own machine. With 250 Inspector users it arrives at ${splitAt('insp250','hi')} seats.</p></div>
   <div class="card"><h4>200 vs 250 Inspector</h4><div class="n">Identical at 840</div>
    <p>Both need ${last('insp250').mgMachines} machines. They differ lower down, where 250 crosses the threshold sooner.</p></div>
  </div>

  <h3>What to quote, at key seat counts</h3>
  <p class="sub">Sized on high usage. Full detail on the option tabs.</p>
  <div class="scroll"><table>
  <thead><tr><th class="t">Seats</th><th class="t">Usage scenario</th><th>Peak<br>concurrent</th>
   <th>A&nbsp;Machines</th><th>A&nbsp;vCPU</th><th>A&nbsp;RAM</th>
   <th>B&nbsp;Machines</th><th>B&nbsp;vCPU</th><th>B&nbsp;RAM</th>
   <th>C&nbsp;Peak&nbsp;inst</th><th>C&nbsp;vCPU</th><th>C&nbsp;RAM</th></tr></thead>
  <tbody>${KEY_SEATS.flatMap(n => SCENARIOS.map((sc,i) => { const h = at(sc.key,n).hi;
    return `<tr><td class="t">${i===0?`<b>${n}</b>`:''}</td><td class="t">${esc(sc.title)}</td>
    <td>${h.concurrent.toFixed(1)}</td><td>${h.mgMachines}</td><td>${h.mgCpu}</td><td>${h.mgRam}</td>
    <td>${h.vpMachines}</td><td>${h.vpCpu}</td><td>${h.vpRam}</td>
    <td>${h.svPeak}</td><td>${h.svCpu}</td><td>${h.svRam}</td></tr>`;})).join('')}</tbody></table></div>

  <div class="note"><b>Where the index needs its own machine</b>, by scenario and by where usage lands
  in the range. This is the one step change in the whole document; everything else is a smooth curve.
  <div class="scroll"><table style="max-width:620px;margin-top:9px">
  <thead><tr><th class="t">Scenario</th><th>Low usage (${USAGE.low.compass}/${USAGE.low.inspector} per day)</th><th>High usage (${USAGE.high.compass}/${USAGE.high.inspector} per day)</th></tr></thead>
  <tbody>${SCENARIOS.map(sc=>`<tr><td class="t">${esc(sc.title)}</td><td>${splitAt(sc.key,'lo')||'—'} seats</td><td>${splitAt(sc.key,'hi')||'—'} seats</td></tr>`).join('')}</tbody></table></div></div>
</section>

${optionPanel('a','A','Managed platform (PaaS)',
 'Fixed instance sizes; the platform handles deploys, scaling and failover. Most instances, because each one is small &mdash; and the fewest moving parts for us to operate. Plan names shown are Render&rsquo;s; equivalent tiers from any provider are fine.',
 HW_COLS, r => { const h=r.hi; return [`<b>${r.seats}</b>`, ...conc(r), esc(h.mgWeb), esc(h.mgIndex), h.mgMachines, h.mgCpu, h.mgRam, h.indexDisk]; },
 'mgColocated',
 'Shaded rows are where the search index moves onto its own machine. Totals can fall there: one shared box had to satisfy the larger demand in every dimension at once, so two right-sized machines total less than one oversized one.')}

${optionPanel('b','B','Raw VPS',
 'Plain virtual servers. Far more CPU and RAM per machine, so the fleet stays small &mdash; but patching, monitoring, backups and failover become an operational responsibility. Plan names shown are Hetzner&rsquo;s; equivalent specs elsewhere are fine, the vCPU and RAM totals are what matter.',
 HW_COLS, r => { const h=r.hi; return [`<b>${r.seats}</b>`, ...conc(r), esc(h.vpWeb), esc(h.vpIndex), h.vpMachines, h.vpCpu, h.vpRam, h.indexDisk]; },
 'vpColocated',
 'Shaded rows are where the search index moves onto its own server.')}

${optionPanel('c','C','Serverless (request-scaled containers)',
 'Each instance is 1 vCPU / 2 GB and exists only while requests are in flight. <b>These figures are not comparable to A and B</b> &mdash; there is no standing fleet, so a low instance count does not mean less capacity. Warm instances are those held alive to avoid a 2&ndash;5 second cold start.',
 SV_COLS, r => { const h=r.hi; return [`<b>${r.seats}</b>`, ...conc(r), h.svPeak, h.svWarm, h.svCpu, h.svRam, 'managed service']; },
 'mgColocated',
 'The search index cannot run serverless and remains a managed service in this option.')}

<section class="panel" id="p-notes">
  <h2><span class="badge">?</span>Assumptions &amp; method</h2>
  <p class="lede">Everything the numbers depend on, stated plainly. If any of it is wrong for the
  deployment you have in mind, the figures move accordingly.</p>
<dl>
<dt>What the workload is</dt><dd>AscendOS is browser-delivered. Code Compass answers building-code
questions against an ingested corpus; Code Inspector analyses site photographs. Both are short,
bursty jobs that hold a CPU core briefly and release it, so the fleet is sized on how many run at
the same instant &mdash; not on seat count.</dd>

<dt>Usage assumed</dt><dd>Code Compass ${U} searches per seat per working day. Code Inspector ${I}
scans per user per working day, for the subset of users named in each block.</dd>

<dt>Peak concurrent, low &ndash; high</dt><dd>How many jobs run at the same instant during the busiest
hour, by Little&rsquo;s Law: arrival rate &times; average job duration. The two figures are the bottom and top
of the usage range. Peak hour is sized at 3&times; the flat daily average, because real usage clusters at
the start of the day and after lunch rather than spreading evenly.</dd>

<dt>Why hardware follows the high end</dt><dd>A fleet sized on average usage is under-provisioned on
every busy day, so all machine columns use ${USAGE.high.compass} searches and ${USAGE.high.inspector} scans per day. If real usage
settles at the bottom of the range, the low concurrency figure shows what you would have needed.</dd>

<dt>Required vs. provisioned</dt><dd>The requirement is what the model computes. The machine columns
show the smallest sensible allocation covering it, which is almost always more. That gap is
deliberate headroom, not waste.</dd>

<dt>App memory and index memory are never summed</dt><dd>Application memory scales with concurrent
jobs. The search index is a fixed working set that grows with the size of the code corpus, not with
seats. Past the threshold they live on different machines, so adding them would be meaningless.</dd>

<dt>Modelling a subset of users</dt><dd>Where only some seats run Code Inspector, that subset is
expressed as its equivalent fleet-wide rate. The model is linear in job volume, so 200 users at ${USAGE.high.inspector}
scans a day is exactly the same total work, and the same peak concurrency, as the equivalent
average spread across all seats.</dd>

<dt>What is not here</dt><dd>Pricing, of any kind. Also excluded: developer and staging environments,
CI, and off-site backup targets &mdash; this is the production serving fleet only.</dd>
</dl>
<p class="foot">Generated from the same model as the interactive planner, so the two cannot disagree.
${SEATS.length} rows per scenario &middot; 20 to 840 seats in steps of 20.</p>
</section>

</div>
<nav class="tabs" role="tablist" aria-label="Worksheets">
 <button class="tab" role="tab" aria-selected="true"  aria-controls="p-summary" data-t="summary">Summary</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-a" data-t="a">A &middot; Managed platform</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-b" data-t="b">B &middot; Raw VPS</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-c" data-t="c">C &middot; Serverless</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-notes" data-t="notes">Assumptions</button>
</nav>
<script>
var CSV_B64="${b64}";
var XLSX_B64="${xb64}";
(function(){
  var tabs=[].slice.call(document.querySelectorAll('.tab'));
  function show(t){
    tabs.forEach(function(b){
      var on=b.dataset.t===t;
      b.setAttribute('aria-selected',on?'true':'false');
      document.getElementById('p-'+b.dataset.t).classList.toggle('on',on);
    });
    window.scrollTo(0,0);
  }
  tabs.forEach(function(b){
    b.addEventListener('click',function(){show(b.dataset.t)});
    // Arrow keys move between tabs, as they do in a spreadsheet.
    b.addEventListener('keydown',function(e){
      var i=tabs.indexOf(b), n=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:-1;
      if(n>=0&&n<tabs.length){tabs[n].focus();show(tabs[n].dataset.t);e.preventDefault();}
    });
  });

  document.getElementById('pr').addEventListener('click',function(){window.print()});

  var bin=atob(CSV_B64), b=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  var text=new TextDecoder('utf-8').decode(b);

  // A sandboxed frame can block a programmatic download outright, and does it
  // SILENTLY -- so this is a plain anchor with nothing to intercept, backed by
  // two manual routes.
  document.getElementById('dl').href='data:text/csv;charset=utf-8;base64,'+CSV_B64;
  var dx=document.getElementById('dx');
  if(XLSX_B64) dx.href='data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,'+XLSX_B64;
  else dx.remove();

  var cp=document.getElementById('cp');
  cp.addEventListener('click',function(){
    var done=function(ok){cp.textContent=ok?'Copied \\u2713':'Use Show raw CSV';
      setTimeout(function(){cp.textContent='Copy CSV'},2600);};
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).then(function(){done(true)},legacy);
    else legacy();
    function legacy(){
      var t=document.createElement('textarea');t.value=text;
      t.style.cssText='position:fixed;left:-9999px;top:0';
      document.body.appendChild(t);t.focus();t.select();
      var ok=false;try{ok=document.execCommand('copy')}catch(e){}
      document.body.removeChild(t);done(ok);
    }
  });

  var sh=document.getElementById('sh'), raw=document.getElementById('raw');
  sh.addEventListener('click',function(){
    if(raw.hidden){raw.value=text;raw.hidden=false;raw.focus();raw.select();sh.textContent='Hide raw CSV';}
    else{raw.hidden=true;sh.textContent='Show raw CSV';}
  });
})();
</script>
</body></html>`;

fs.writeFileSync(path.join(__dirname,'hardware.html'), page);
console.log('hardware.html', (page.length/1024).toFixed(1)+'KB | xlsx embedded: '+(xb64?(xb64.length/1024).toFixed(0)+'KB':'NO')+' | 5 tabs | print: all panels, landscape, page-break per tab');
