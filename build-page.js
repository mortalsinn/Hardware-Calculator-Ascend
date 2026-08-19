const fs = require('fs'); const path = require('path');
const { SEATS, SCENARIOS, data, CSV, USAGE } = require('./build-hardware.js');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const b64 = Buffer.from(CSV, 'utf8').toString('base64');
const U = `${USAGE.low.compass}–${USAGE.high.compass}`;
const I = `${USAGE.low.inspector}–${USAGE.high.inspector}`;

// Two kinds of row are worth reading. A STEP is where the machine count
// changes. A SPLIT is where the search index stops sharing the web box and
// moves to its own machine -- at which point total CPU and RAM can legitimately
// go DOWN, because one shared box had to be sized on the larger of the two
// workloads in every dimension at once. That dip is real; it is flagged rather
// than smoothed away.
function marks(rows) {
  let prev = null;
  return rows.map(r => {
    const h = r.hi, p = prev;
    const o = { seats: r.seats, lo: r.lo, h,
      stepMg: p && h.mgMachines !== p.mgMachines,
      stepVp: p && h.vpMachines !== p.vpMachines,
      stepSv: p && h.svPeak !== p.svPeak,
      splitMg: p && h.mgColocated !== p.mgColocated,
      splitVp: p && h.vpColocated !== p.vpColocated };
    prev = h; return o;
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
    <th class="g-need">Seats</th><th class="g-need">Peak concurrent<br><span class="lt">low &ndash; high</span></th>
    <th class="g-need">vCPU</th><th class="g-need">App RAM<br>GB</th><th class="g-need">Index RAM<br>GB</th><th class="g-need">Index disk<br>GB</th>
    <th class="g-mg">Web tier</th><th class="g-mg">Index host</th><th class="g-mg">Machines</th><th class="g-mg">Total vCPU</th><th class="g-mg">Total RAM GB</th>
    <th class="g-vp">Web tier</th><th class="g-vp">Index host</th><th class="g-vp">Machines</th><th class="g-vp">Total vCPU</th><th class="g-vp">Total RAM GB</th>
    <th class="g-sv">Peak inst.</th><th class="g-sv">Warm</th><th class="g-sv">Peak vCPU</th><th class="g-sv">Peak RAM GB</th>
  </tr>
</thead>
<tbody>
${marks(rows).map(r => {
  const h = r.h, split = r.splitMg || r.splitVp;
  const cls = split ? ' class="split"' : (r.stepMg||r.stepVp||r.stepSv) ? ' class="step"' : '';
  return `  <tr${cls}>
    <td class="seats">${r.seats}${split?'<sup>&dagger;</sup>':''}</td>
    <td class="rng">${r.lo.concurrent.toFixed(1)} &ndash; ${h.concurrent.toFixed(1)}</td>
    <td>${h.vcpu.toFixed(1)}</td><td>${h.appRam.toFixed(1)}</td><td>${h.indexGb.toFixed(1)}</td><td>${h.indexDisk}</td>
    <td class="plan">${esc(h.mgWeb)}</td><td class="plan${r.splitMg?' up':''}">${esc(h.mgIndex)}</td><td${r.stepMg?' class="up"':''}>${h.mgMachines}</td><td>${h.mgCpu}</td><td>${h.mgRam}</td>
    <td class="plan">${esc(h.vpWeb)}</td><td class="plan${r.splitVp?' up':''}">${esc(h.vpIndex)}</td><td${r.stepVp?' class="up"':''}>${h.vpMachines}</td><td>${h.vpCpu}</td><td>${h.vpRam}</td>
    <td${r.stepSv?' class="up"':''}>${h.svPeak}</td><td>${h.svWarm}</td><td>${h.svCpu}</td><td>${h.svRam}</td>
  </tr>`;}).join('\n')}
</tbody></table></div>`;

const last = k => data[k][data[k].length - 1].hi;
const lastLo = k => data[k][data[k].length - 1].lo;
const splitAt = (k, b) => { const a = data[k];
  for (let i=1;i<a.length;i++) if (a[i-1][b].mgColocated && !a[i][b].mgColocated) return a[i].seats;
  return a[0][b].mgColocated ? null : 20; };

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AscendOS — Hardware Requirements</title>
<style>
 :root{--ink:#141821;--mut:#5c6577;--line:#dfe3ea;--bg:#fff;--panel:#f7f8fa;
  --need:#eef1f6;--mg:#e8f0fb;--vp:#eaf5ec;--sv:#f6eef8;--up:#fff6e0;
  --split:#e6f0ff;--splitb:#7ba7e0;--accent:#1f4f8f}
 *{box-sizing:border-box}
 body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
 .wrap{max-width:1560px;margin:0 auto;padding:34px 22px 80px}
 h1{font-size:27px;margin:0 0 6px;letter-spacing:-.02em}
 h2{font-size:19px;margin:44px 0 3px;letter-spacing:-.01em}
 .sub{color:var(--mut);margin:0 0 14px;font-size:14px}
 .lede{color:var(--mut);max-width:76ch;margin:0 0 20px}
 .bar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 26px}
 .btn{display:inline-block;padding:9px 16px;border-radius:7px;background:var(--accent);color:#fff;
   text-decoration:none;font-weight:600;font-size:14px;border:0;cursor:pointer;font-family:inherit}
 .btn.alt{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
 .fallback{font-size:12.5px;color:var(--mut);max-width:80ch;margin:-14px 0 22px;line-height:1.5}
 #raw{width:100%;height:290px;margin:0 0 24px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
   border:1px solid var(--line);border-radius:8px;padding:11px;background:var(--panel);color:var(--ink);
   white-space:pre;overflow:auto;resize:vertical}
 #raw[hidden]{display:none}
 .btn:focus-visible,#raw:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
 .scroll{overflow-x:auto;border:1px solid var(--line);border-radius:9px}
 table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
 th,td{padding:5px 9px;text-align:right;border-bottom:1px solid var(--line)}
 thead th{position:sticky;top:0;font-weight:600;font-size:11.5px;text-transform:uppercase;
   letter-spacing:.04em;color:var(--mut);background:var(--panel)}
 .lt{font-weight:400;text-transform:none;letter-spacing:0;font-size:10.5px;opacity:.8}
 tr.grp th{text-align:center;font-size:12px;color:var(--ink);border-bottom:1px solid var(--line)}
 .g-need{background:var(--need)!important}.g-mg{background:var(--mg)!important}
 .g-vp{background:var(--vp)!important}.g-sv{background:var(--sv)!important}
 td.seats{text-align:left;font-weight:700}
 td.rng{font-size:12.5px}
 td.plan{text-align:left;font-size:12px;color:var(--mut)}
 tr.step td{background:var(--up)}
 tr.split td{background:var(--split);box-shadow:inset 0 1px 0 var(--splitb),inset 0 -1px 0 var(--splitb)}
 td.up{font-weight:700;color:#8a5a00}
 tbody tr:hover td{background:#f1f4f9}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:20px 0 26px}
 .card{border:1px solid var(--line);border-radius:9px;padding:14px 16px;background:var(--panel)}
 .card h3{margin:0 0 4px;font-size:14px}
 .card .n{font-size:21px;font-weight:700;letter-spacing:-.02em}
 .card p{margin:5px 0 0;font-size:12.5px;color:var(--mut);line-height:1.45}
 .note{border-left:3px solid var(--accent);background:var(--panel);padding:12px 16px;border-radius:0 7px 7px 0;
   margin:18px 0;font-size:13.5px;color:var(--mut);max-width:84ch}
 .note b{color:var(--ink)}
 .mini{border-collapse:collapse;font-size:13px;margin:14px 0 0;font-variant-numeric:tabular-nums}
 .mini th,.mini td{border:1px solid var(--line);padding:6px 12px;text-align:right}
 .mini th{background:var(--panel);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
 .mini td:first-child,.mini th:first-child{text-align:left}
 dl{margin:0;font-size:13.5px;color:var(--mut);max-width:84ch}
 dt{font-weight:600;color:var(--ink);margin-top:11px}
 dd{margin:2px 0 0}
 footer{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);color:var(--mut);font-size:12.5px}
 @media print{.bar,.fallback,#raw{display:none}body{font-size:11px}table{font-size:9.5px}
   .scroll{overflow:visible;border:0}h2{page-break-after:avoid}tr{page-break-inside:avoid}}
 @media (prefers-color-scheme:dark){
  :root{--ink:#e8ecf3;--mut:#96a0b3;--line:#2a3140;--bg:#12151c;--panel:#1a1f29;
   --need:#1c2230;--mg:#182338;--vp:#16271c;--sv:#241a2b;--up:#332a12;
   --split:#182a44;--splitb:#3f6698;--accent:#5b9bf0}
  tbody tr:hover td{background:#1e2431}td.up{color:#e0b060}}
</style></head><body><div class="wrap">

<h1>AscendOS — Hardware Requirements</h1>
<p class="lede">What the platform needs to run, from 20 to 840 seats, under three deployment
options. This is a hardware specification &mdash; server counts, CPU cores, memory and disk. It carries
no pricing: costs depend on vendor and contract, and live in the interactive planner.</p>

<div class="bar">
  <a class="btn" id="dl" download="AscendOS-Hardware-Requirements.csv">Download spreadsheet (CSV)</a>
  <button class="btn alt" id="cp">Copy CSV to clipboard</button>
  <button class="btn alt" id="sh">Show raw CSV</button>
  <a class="btn alt" href="index.html">Interactive planner</a>
</div>
<p class="fallback">If the download does nothing, this page is inside a sandbox that blocks downloads &mdash;
use <b>Copy CSV to clipboard</b> and paste into a blank spreadsheet, or <b>Show raw CSV</b> to select it by hand.</p>
<textarea id="raw" spellcheck="false" hidden></textarea>

<div class="note"><b>Usage assumed throughout:</b> Code Compass ${U} searches per seat per working
day; Code Inspector ${I} scans per user per working day. Because that is a range and not a number,
every row is computed twice. The <b>hardware columns are sized on the high end</b> &mdash; you provision
for the busy day, not the average one &mdash; and the low end is shown beside it so you can see how much
of the fleet is driven by the top of the range.</div>

<h2>What the numbers say</h2>
<div class="cards">
 <div class="card"><h3>840 seats, Compass only</h3><div class="n">${last('compass').mgCpu} vCPU &middot; ${last('compass').mgRam} GB</div>
  <p>${lastLo('compass').concurrent.toFixed(0)}&ndash;${last('compass').concurrent.toFixed(0)} searches in flight at peak. That is ${last('compass').mgMachines} managed instances,
  or ${last('compass').vpMachines} VPS servers at ${last('compass').vpCpu} vCPU / ${last('compass').vpRam} GB.</p></div>
 <div class="card"><h3>The index splits early</h3><div class="n">${splitAt('compass','hi')} seats</div>
  <p>Past this point the search index no longer shares a box with the application. With 250
  Inspector users it happens at ${splitAt('insp250','hi')} seats. This is the one real architectural
  threshold in the table.</p></div>
 <div class="card"><h3>200 vs 250 Inspector users</h3><div class="n">Same hardware at 840</div>
  <p>Both land on ${last('insp250').mgMachines} machines. They diverge lower down, where 250 users
  crosses the index threshold sooner.</p></div>
</div>

<div class="note"><b>At these rates the fleet is real, but still modest.</b> A Compass search holds a
core for a second or two, then releases it, so 840 seats at ${U} searches a day resolves to
${last('compass').concurrent.toFixed(0)} jobs running at the same instant. On raw VPS that is ${last('compass').vpMachines} servers. What grows
fastest with seat count is AI usage and the size of the search index, not the number of machines.</div>

<div class="note"><b>Where the index needs its own machine</b>, by scenario and by where usage lands
in the range. This is the number worth planning around &mdash; everything else on this page is a smooth
curve.
<table class="mini"><thead><tr><th>Scenario</th><th>Low usage (${USAGE.low.compass}/${USAGE.low.inspector} per day)</th><th>High usage (${USAGE.high.compass}/${USAGE.high.inspector} per day)</th></tr></thead>
<tbody>${SCENARIOS.map(sc => `<tr><td>${esc(sc.title)}</td><td>${splitAt(sc.key,'lo')||'from the start'} seats</td><td>${splitAt(sc.key,'hi')||'from the start'} seats</td></tr>`).join('')}</tbody></table></div>

${SCENARIOS.map(sc => `<h2>${esc(sc.title)}</h2>
<p class="sub">${esc(sc.sub)} Hardware sized on the high end. Highlighted rows are where the machine
count changes; the row marked &dagger; is where the search index moves to its own machine.</p>
${table(data[sc.key])}`).join('\n')}

<h2>How to read this</h2>
<dl>
<dt>Peak concurrent, low &ndash; high</dt><dd>How many jobs are running at the same instant during the
busiest hour, by Little&rsquo;s Law: arrival rate &times; average job duration. The two figures are the bottom
and top of the assumed usage range. Peak hour is sized at 3&times; the flat daily average, because real
usage clusters at the start of the day and after lunch rather than spreading evenly.</dd>

<dt>Why hardware follows the high end</dt><dd>A fleet sized on average usage is under-provisioned on
every busy day. The requirement columns and all three option columns therefore use ${USAGE.high.compass} Compass
searches and ${USAGE.high.inspector} Inspector scans per day. If real usage settles at the bottom of the range, the
concurrency column shows what you would have needed, and you can scale down deliberately.</dd>

<dt>Computed requirement vs. what you buy</dt><dd>The requirement is what the maths produces &mdash; 4.6
vCPU, say. The option columns show the smallest sensible allocation that covers it, which is almost
always more. That gap is headroom you deliberately pay for, not waste.</dd>

<dt>App RAM and index RAM are listed separately</dt><dd>Application memory scales with concurrent
jobs. The search index is a fixed working set that grows with the size of the code corpus, not with
seats. They are never summed, because past a threshold they stop living on the same machine.</dd>

<dt>&dagger; Rows where the totals step DOWN</dt><dd>Not an error. While the app and index share one
box, that box must satisfy the larger demand in <em>every</em> dimension at once &mdash; enough RAM for both,
at whatever CPU comes attached. Splitting them lets you buy two right-sized machines instead of one
oversized one, so total cores and memory can genuinely fall at the split even as load rises. The
machine count goes up; the totals may not.</dd>

<dt>Option A &middot; Managed platform</dt><dd>A PaaS such as Render. Fixed instance sizes; deploys, scaling
and failover handled for you. Fewest moving parts, least control over the machine, and the most
instances, because each one is small.</dd>

<dt>Option B &middot; Raw VPS</dt><dd>Plain virtual servers such as Hetzner. Far more CPU and RAM per
machine, so the fleet stays small &mdash; but patching, monitoring, backups and failover become your
team&rsquo;s responsibility. The hardware is cheaper; the operational burden is not.</dd>

<dt>Option C &middot; Serverless</dt><dd>Request-scaled containers such as Cloud Run, each 1 vCPU / 2 GB,
existing only while requests are in flight. <b>Its numbers are not comparable to the other two
columns</b> &mdash; there is no standing fleet to size, so a low instance count does not mean less capacity.
Warm instances are those kept alive to avoid a 2&ndash;5 second cold start. The search index cannot run
serverless and remains a managed service.</dd>

<dt>Modelling a subset of users</dt><dd>Where only some seats run Code Inspector, that subset is
expressed as its equivalent fleet-wide rate. The model is linear in job volume, so 200 users at ${USAGE.high.inspector}
scans a day produces exactly the same total work, and the same peak concurrency, as the equivalent
average spread across all seats.</dd>
</dl>

<footer>Generated from the same model as the interactive planner, so the two cannot disagree.
Regenerate with <code>node build-hardware.js &amp;&amp; node build-page.js</code> after any model change.
${SEATS.length} rows per scenario &middot; 20 to 840 seats in steps of 20 &middot; Compass ${U}/day, Inspector ${I}/day.</footer>
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
    var done=function(ok){cp.textContent=ok?'Copied \\u2713':'Copy failed \\u2014 use Show raw CSV';
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
console.log('hardware.html', (page.length/1024).toFixed(1)+'KB');
