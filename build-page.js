const fs = require('fs'); const path = require('path');
const { SEATS, SCENARIOS, data, CSV } = require('./build-hardware.js');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const b64 = Buffer.from(CSV, 'utf8').toString('base64');

// A row is worth reading when the machine count changes. Everything
// between two steps is the same hardware with more headroom used up.
// Two kinds of row are worth reading. A STEP is where the machine count
// changes. A SPLIT is where the search index stops sharing the web box and
// moves to its own machine — at which point total CPU and RAM can legitimately
// go DOWN, because one shared box had to be sized on the larger of the two
// workloads in every dimension at once. That dip is real; it is flagged rather
// than smoothed away.
function marks(rows) {
  let prev = null;
  return rows.map(r => {
    const o = { ...r,
      stepMg: prev && r.mgMachines !== prev.mgMachines,
      stepVp: prev && r.vpMachines !== prev.vpMachines,
      stepSv: prev && r.svPeak !== prev.svPeak,
      splitMg: prev && r.mgColocated !== prev.mgColocated,
      splitVp: prev && r.vpColocated !== prev.vpColocated };
    prev = r; return o;
  });
}

const table = (rows) => `
<div class="scroll"><table>
<thead>
  <tr class="grp">
    <th colspan="6" class="g-need">Computed requirement</th>
    <th colspan="5" class="g-mg">Option A &middot; Managed platform</th>
    <th colspan="5" class="g-vp">Option B &middot; Raw VPS</th>
    <th colspan="4" class="g-sv">Option C &middot; Serverless</th>
  </tr>
  <tr>
    <th class="g-need">Seats</th><th class="g-need">Peak<br>concurrent</th>
    <th class="g-need">vCPU</th><th class="g-need">App RAM<br>GB</th><th class="g-need">Index RAM<br>GB</th><th class="g-need">Index disk<br>GB</th>
    <th class="g-mg">Web tier</th><th class="g-mg">Index host</th><th class="g-mg">Machines</th><th class="g-mg">Total vCPU</th><th class="g-mg">Total RAM GB</th>
    <th class="g-vp">Web tier</th><th class="g-vp">Index host</th><th class="g-vp">Machines</th><th class="g-vp">Total vCPU</th><th class="g-vp">Total RAM GB</th>
    <th class="g-sv">Peak inst.</th><th class="g-sv">Warm</th><th class="g-sv">Peak vCPU</th><th class="g-sv">Peak RAM GB</th>
  </tr>
</thead>
<tbody>
${marks(rows).map(r => {
  const split = r.splitMg || r.splitVp;
  const cls = split ? ' class="split"' : (r.stepMg||r.stepVp||r.stepSv) ? ' class="step"' : '';
  return `  <tr${cls}>
    <td class="seats">${r.seats}${split?'<sup>&dagger;</sup>':''}</td><td>${r.concurrent.toFixed(1)}</td>
    <td>${r.vcpu.toFixed(1)}</td><td>${r.appRam.toFixed(1)}</td><td>${r.indexGb.toFixed(1)}</td><td>${r.indexDisk}</td>
    <td class="plan">${esc(r.mgWeb)}</td><td class="plan${r.splitMg?' up':''}">${esc(r.mgIndex)}</td><td${r.stepMg?' class="up"':''}>${r.mgMachines}</td><td>${r.mgCpu}</td><td>${r.mgRam}</td>
    <td class="plan">${esc(r.vpWeb)}</td><td class="plan${r.splitVp?' up':''}">${esc(r.vpIndex)}</td><td${r.stepVp?' class="up"':''}>${r.vpMachines}</td><td>${r.vpCpu}</td><td>${r.vpRam}</td>
    <td${r.stepSv?' class="up"':''}>${r.svPeak}</td><td>${r.svWarm}</td><td>${r.svCpu}</td><td>${r.svRam}</td>
  </tr>`;}).join('\n')}
</tbody></table></div>`;

const last = k => data[k][data[k].length - 1];

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AscendOS — Hardware Requirements</title>
<style>
 :root{--ink:#141821;--mut:#5c6577;--line:#dfe3ea;--bg:#fff;--panel:#f7f8fa;
  --need:#eef1f6;--mg:#e8f0fb;--vp:#eaf5ec;--sv:#f6eef8;--up:#fff6e0;--split:#e6f0ff;--splitb:#7ba7e0;--accent:#1f4f8f}
 *{box-sizing:border-box}
 body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
 .wrap{max-width:1500px;margin:0 auto;padding:34px 22px 80px}
 h1{font-size:27px;margin:0 0 6px;letter-spacing:-.02em}
 h2{font-size:19px;margin:44px 0 3px;letter-spacing:-.01em}
 .sub{color:var(--mut);margin:0 0 14px;font-size:14px}
 .lede{color:var(--mut);max-width:74ch;margin:0 0 22px}
 .bar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 26px}
 .btn{display:inline-block;padding:9px 16px;border-radius:7px;background:var(--accent);color:#fff;
   text-decoration:none;font-weight:600;font-size:14px;border:0;cursor:pointer;font-family:inherit}
 .btn.alt{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
 .scroll{overflow-x:auto;border:1px solid var(--line);border-radius:9px}
 table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
 th,td{padding:5px 9px;text-align:right;border-bottom:1px solid var(--line)}
 thead th{position:sticky;top:0;font-weight:600;font-size:11.5px;text-transform:uppercase;
   letter-spacing:.04em;color:var(--mut);background:var(--panel)}
 tr.grp th{text-align:center;font-size:12px;color:var(--ink);border-bottom:1px solid var(--line)}
 .g-need{background:var(--need)!important}.g-mg{background:var(--mg)!important}
 .g-vp{background:var(--vp)!important}.g-sv{background:var(--sv)!important}
 td.seats{text-align:left;font-weight:700}
 td.plan{text-align:left;font-size:12px;color:var(--mut)}
 tr.step td{background:var(--up)}
 tr.split td{background:var(--split);box-shadow:inset 0 1px 0 var(--splitb),inset 0 -1px 0 var(--splitb)}
 td.up{font-weight:700;color:#8a5a00}
 tbody tr:hover td{background:#f1f4f9}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:20px 0 30px}
 .card{border:1px solid var(--line);border-radius:9px;padding:14px 16px;background:var(--panel)}
 .card h3{margin:0 0 4px;font-size:14px}
 .card .n{font-size:22px;font-weight:700;letter-spacing:-.02em}
 .card p{margin:5px 0 0;font-size:12.5px;color:var(--mut);line-height:1.45}
 .note{border-left:3px solid var(--accent);background:var(--panel);padding:12px 16px;border-radius:0 7px 7px 0;
   margin:18px 0;font-size:13.5px;color:var(--mut);max-width:82ch}
 .note b{color:var(--ink)}
 dl{margin:0;font-size:13.5px;color:var(--mut);max-width:82ch}
 dt{font-weight:600;color:var(--ink);margin-top:11px}
 dd{margin:2px 0 0}
 footer{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);color:var(--mut);font-size:12.5px}
 .fallback{font-size:12.5px;color:var(--mut);max-width:80ch;margin:-14px 0 22px;line-height:1.5}
 #raw{width:100%;height:290px;margin:0 0 24px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
   border:1px solid var(--line);border-radius:8px;padding:11px;background:var(--panel);color:var(--ink);
   white-space:pre;overflow:auto;resize:vertical}
 #raw[hidden]{display:none}
 .btn:focus-visible,#raw:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
 @media print{.fallback,#raw{display:none}.bar{display:none}body{font-size:11px}table{font-size:9.5px}
   .scroll{overflow:visible;border:0}h2{page-break-after:avoid}tr{page-break-inside:avoid}}
 @media (prefers-color-scheme:dark){
  :root{--ink:#e8ecf3;--mut:#96a0b3;--line:#2a3140;--bg:#12151c;--panel:#1a1f29;
   --need:#1c2230;--mg:#182338;--vp:#16271c;--sv:#241a2b;--up:#332a12;--split:#182a44;--splitb:#3f6698;--accent:#5b9bf0}
  tbody tr:hover td{background:#1e2431}td.up{color:#e0b060}}
</style></head><body><div class="wrap">

<h1>AscendOS — Hardware Requirements</h1>
<p class="lede">What the platform needs to run, from 20 to 840 seats, under three deployment
options. This is a hardware specification: server counts, CPU cores and memory. It carries no
pricing — costs depend on vendor and contract, and live in the interactive planner.</p>

<div class="bar">
  <a class="btn" id="dl" download="AscendOS-Hardware-Requirements.csv">Download spreadsheet (CSV)</a>
  <button class="btn alt" id="cp">Copy CSV to clipboard</button>
  <button class="btn alt" id="sh">Show raw CSV</button>
  <a class="btn alt" href="index.html">Interactive planner</a>
</div>
<p class="fallback">If the download does nothing, this page is inside a sandbox that blocks downloads &mdash;
use <b>Copy CSV to clipboard</b> and paste into a blank spreadsheet, or <b>Show raw CSV</b> to select it by hand.</p>
<textarea id="raw" spellcheck="false" hidden></textarea>

<h2>What the numbers say</h2>
<div class="cards">
 <div class="card"><h3>840 seats, Compass only</h3><div class="n">${last('compass').mgCpu} vCPU &middot; ${last('compass').mgRam} GB</div>
  <p>Peak load is ${last('compass').concurrent.toFixed(1)} searches in flight at once. That is ${last('compass').mgMachines} managed instances,
  or ${last('compass').vpMachines} VPS server${last('compass').vpMachines>1?'s':''} at ${last('compass').vpCpu} vCPU / ${last('compass').vpRam} GB.</p></div>
 <div class="card"><h3>Adding 200 Inspector users</h3><div class="n">${last('insp200').mgMachines} machines</div>
  <p>Concurrency roughly doubles, to ${last('insp200').concurrent.toFixed(1)}. Image analysis is slow per job but low in
  volume, so it buys concurrency, not fleet size.</p></div>
 <div class="card"><h3>200 &rarr; 250 Inspector users</h3><div class="n">Index splits off</div>
  <p>Peak concurrency crosses ${last('insp250').concurrent.toFixed(1)}, past which the search index no longer shares the web
  box. This is the one genuine architectural threshold in the whole table.</p></div>
</div>

<div class="note"><b>Hardware is not the constraint at this scale.</b> Compass work is short and
bursty &mdash; a search holds a core for a second or two, then releases it. Even at 840 seats the whole
fleet is a handful of small machines, and on raw VPS it is ${last('insp250').vpMachines}. What grows with seat count
is AI usage and the size of the search index, not the server room.</div>

<div class="note"><b>The threshold worth planning around is the index, not the seats.</b> Below roughly
12 concurrent jobs the application and its search index share a machine, which is how AscendOS and
McLean&rsquo;s run today. Above it they separate. Everything else on this page is a smooth curve; that
is the one step change, and it is the row marked &dagger;.</div>

${SCENARIOS.map(sc => `<h2>${esc(sc.title)}</h2>
<p class="sub">${esc(sc.sub)} Highlighted rows are where the machine count changes.</p>
${table(data[sc.key])}`).join('\n')}

<h2>How to read this</h2>
<dl>
<dt>Peak concurrent</dt><dd>How many jobs are running at the same instant during the busiest hour,
by Little&rsquo;s Law: arrival rate &times; average job duration. Sized at 3&times; the flat daily average, because
real usage clusters at the start of the day and after lunch rather than spreading evenly.</dd>

<dt>Computed requirement vs. what you buy</dt><dd>The requirement is what the maths produces &mdash; 1.9
vCPU, say. The option columns show the smallest sensible allocation that covers it, which is almost
always more. That gap is headroom you deliberately pay for, not waste.</dd>

<dt>App RAM and index RAM are listed separately</dt><dd>Application memory scales with concurrent
jobs. The search index is a fixed working set that grows with the size of the code corpus, not with
seats. They are never summed, because past a threshold they stop living on the same machine.</dd>

<dt>&dagger; Rows where the totals step DOWN</dt><dd>Not an error. While the app and index share one
box, that box must satisfy the larger demand in <em>every</em> dimension at once &mdash; enough RAM for both,
priced at whatever CPU comes attached. Splitting them lets you buy two right-sized machines instead
of one oversized one, so total cores and memory can genuinely fall at the split even as load rises.
The machine count goes up; the totals may not.</dd>

<dt>Option A &middot; Managed platform</dt><dd>A PaaS such as Render. Fixed instance sizes, deploys, scaling
and failover handled for you. Fewest moving parts, least control over the machine, most instances
because each one is small.</dd>

<dt>Option B &middot; Raw VPS</dt><dd>Plain virtual servers such as Hetzner. Far more CPU and RAM per
machine, so the fleet stays tiny &mdash; but patching, monitoring, backups and failover become your
team&rsquo;s responsibility. The hardware is cheaper; the operational burden is not.</dd>

<dt>Option C &middot; Serverless</dt><dd>Request-scaled containers such as Cloud Run, each 1 vCPU / 2 GB,
existing only while requests are in flight. <b>Its numbers are not comparable to the other two
columns</b> &mdash; there is no standing fleet to size, so a low instance count does not mean less capacity.
Warm instances are those kept alive to avoid a 2&ndash;5 second cold start. The search index cannot run
serverless and remains a managed service.</dd>

<dt>The assumption behind every row</dt><dd>Five Code Compass searches per seat per working day, plus,
where stated, five Code Inspector scans per day for the named subset of users. A subset is modelled as
its equivalent fleet-wide rate: the model is linear in job volume, so 200 users at 5 scans a day
produces exactly the same total work, and the same concurrency, as the equivalent average spread
across all seats.</dd>
</dl>

<footer>Generated from the same model as the interactive planner, so the two cannot disagree.
Regenerate with <code>node build-hardware.js</code> after any model change.
${SEATS.length} rows per scenario &middot; 20 to 840 seats in steps of 20.</footer>
</div>
<script>
var CSV_B64="${b64}";
(function(){
  var bin=atob(CSV_B64), b=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  var text=new TextDecoder('utf-8').decode(b);

  // THREE ROUTES, because a sandboxed iframe can block a programmatic download
  // outright -- and it fails SILENTLY, which reads as a broken page.
  // 1. a plain anchor: no click handler, so there is nothing to block.
  document.getElementById('dl').href='data:text/csv;charset=utf-8;base64,'+CSV_B64;

  // 2. clipboard, with the pre-async-API fallback for locked-down frames.
  var cp=document.getElementById('cp');
  cp.addEventListener('click',function(){
    var done=function(ok){cp.textContent=ok?'Copied \u2713':'Copy failed \u2014 use Show raw CSV';
      setTimeout(function(){cp.textContent='Copy CSV to clipboard'},2600);};
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){done(true)},legacy);
    } else legacy();
    function legacy(){
      var t=document.createElement('textarea');t.value=text;
      t.style.cssText='position:fixed;left:-9999px;top:0';
      document.body.appendChild(t);t.focus();t.select();
      var ok=false;try{ok=document.execCommand('copy')}catch(e){}
      document.body.removeChild(t);done(ok);
    }
  });

  // 3. show it and select it.
  var sh=document.getElementById('sh'), raw=document.getElementById('raw');
  sh.addEventListener('click',function(){
    if(raw.hidden){raw.value=text;raw.hidden=false;raw.focus();raw.select();
      sh.textContent='Hide raw CSV';raw.scrollIntoView({block:'nearest'});}
    else {raw.hidden=true;sh.textContent='Show raw CSV';}
  });
})();
</script>
</body></html>`;

fs.writeFileSync(path.join(__dirname,'hardware.html'), page);
console.log('hardware.html', (page.length/1024).toFixed(1)+'KB  (CSV embedded, downloads offline)');
