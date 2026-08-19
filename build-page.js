const fs = require('fs'); const path = require('path');
const { SEATS, SCENARIOS, data, CSV, USAGE } = require('./build-hardware.js');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const b64 = Buffer.from(CSV, 'utf8').toString('base64');
const XP = path.join(__dirname, 'AscendOS-Hardware-Requirements.xlsx');
const xb64 = fs.existsSync(XP) ? fs.readFileSync(XP).toString('base64') : '';

const U = `${USAGE.low.compass}&ndash;${USAGE.high.compass}`;
const I = `${USAGE.low.inspector}&ndash;${USAGE.high.inspector}`;
const STAGES = [20, 100, 200, 300, 400, 500, 600, 700, 840];
const at = (k,n) => data[k][SEATS.indexOf(n)];
const last = k => data[k][data[k].length-1].hi;

const reqTable = (seatList) => `<div class="scroll"><table>
<thead>
 <tr class="grp"><th></th>
  <th colspan="3" class="g1">Compass only &mdash; light case</th>
  <th colspan="3" class="g2">All modules &mdash; heavy case</th>
  <th colspan="2" class="g3">Search index</th></tr>
 <tr><th class="t">Seats<br><span class="lt">reference</span></th>
  <th class="g1">Jobs at once</th><th class="g1">vCPU</th><th class="g1">RAM GB</th>
  <th class="g2">Jobs at once</th><th class="g2">vCPU</th><th class="g2">RAM GB</th>
  <th class="g3">RAM GB</th><th class="g3">Disk GB</th></tr>
</thead>
<tbody>
${seatList.map(n => { const c = at('compass',n), f = at('insp250',n);
 return `  <tr><td class="t"><b>${n}</b></td>
    <td class="rng">${c.lo.concurrent.toFixed(1)} <span class="dash">&ndash;</span> ${c.hi.concurrent.toFixed(1)}</td>
    <td>${c.hi.vcpu.toFixed(1)}</td><td>${c.hi.appRam.toFixed(1)}</td>
    <td class="rng">${f.lo.concurrent.toFixed(1)} <span class="dash">&ndash;</span> ${f.hi.concurrent.toFixed(1)}</td>
    <td>${f.hi.vcpu.toFixed(1)}</td><td>${f.hi.appRam.toFixed(1)}</td>
    <td>${f.hi.indexGb.toFixed(1)}</td><td>${f.hi.indexDisk}</td></tr>`;}).join('\n')}
</tbody></table></div>`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AscendOS — Hardware Requirements</title>
<style>
 :root{--ink:#151a23;--mut:#5d6675;--fade:#8b93a3;--line:#dee2e9;--bg:#fff;--panel:#f6f8fa;
  --accent:#1f4f8f;--accentb:#e8eef8;--head:#1f4f8f;--g1:#2c5f9e;--g2:#2f6b57;--g3:#6b4a86}
 *{box-sizing:border-box}
 body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,sans-serif;
   color:var(--ink);background:var(--bg);-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .wrap{max-width:1000px;margin:0 auto;padding:30px 24px 96px}
 .masthead{border-bottom:2px solid var(--accent);padding-bottom:14px;margin-bottom:20px;
   display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
 h1{font-size:24px;margin:0;letter-spacing:-.02em}
 .for{font-size:13px;color:var(--mut);margin:3px 0 0}
 .meta{font-size:12px;color:var(--fade);text-align:right;line-height:1.5}
 h2{font-size:19px;margin:0 0 7px;letter-spacing:-.01em}
 h3{font-size:13px;margin:26px 0 6px;color:var(--accent);text-transform:uppercase;letter-spacing:.05em}
 .lede{color:var(--mut);max-width:82ch;margin:0 0 16px;font-size:13.5px}
 .bar{display:flex;gap:9px;flex-wrap:wrap;margin:0 0 8px}
 .btn{display:inline-block;padding:8px 15px;border-radius:6px;background:var(--accent);color:#fff;
   text-decoration:none;font-weight:600;font-size:13.5px;border:0;cursor:pointer;font-family:inherit}
 .btn.alt{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
 .btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
 .hint{font-size:12px;color:var(--fade);margin:0 0 22px;max-width:82ch}
 #raw{width:100%;height:240px;margin:0 0 20px;font:11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
   border:1px solid var(--line);border-radius:7px;padding:10px;background:var(--panel);color:var(--ink);
   white-space:pre;overflow:auto;resize:vertical}
 #raw[hidden]{display:none}
 .scroll{overflow-x:auto;margin:4px 0 0}
 table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
 th,td{padding:5px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
 thead th{background:var(--head);color:#fff;font-weight:600;font-size:11px;text-transform:uppercase;
   letter-spacing:.045em;vertical-align:bottom;border-bottom:0}
 tr.grp th{text-align:left;font-size:11.5px;padding-bottom:3px}
 tr.grp th:first-child{background:var(--head)}
 .g1{background:var(--g1)!important}.g2{background:var(--g2)!important}.g3{background:var(--g3)!important}
 .lt{font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;opacity:.75}
 th.t,td.t{text-align:left}
 td.rng{text-align:left;color:var(--mut)}
 .dash{color:var(--fade)}
 tbody tr:nth-child(even) td{background:var(--panel)}
 tbody tr:hover td{background:var(--accentb)}
 .note{border-left:3px solid var(--accent);background:var(--panel);padding:12px 16px;
   margin:16px 0;font-size:13px;color:var(--mut);max-width:88ch}
 .note b{color:var(--ink)}
 .note.key{border-left-color:#7a9a3f}
 .arith{border-collapse:collapse;margin:10px 0 4px;font-size:12.5px;max-width:560px;width:auto}
 .arith td{border:0;border-bottom:1px solid var(--line);padding:3px 12px 3px 0;text-align:left;color:var(--mut);white-space:normal}
 .arith td.v{text-align:right;color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
 .arith tr.tot td{border-bottom:0;border-top:1px solid var(--accent);padding-top:5px}
 dl{margin:0;font-size:13.5px;color:var(--mut);max-width:88ch}
 dt{font-weight:600;color:var(--ink);margin-top:14px}
 dd{margin:3px 0 0}
 dd.hard{border-left:3px solid #b4553a;padding-left:11px}
 .panel{display:none}.panel.on{display:block}
 .tabs{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--line);
   display:flex;gap:2px;padding:0 24px;overflow-x:auto;z-index:9;box-shadow:0 -2px 8px rgba(0,0,0,.05)}
 .tab{border:1px solid var(--line);border-bottom:0;border-radius:6px 6px 0 0;background:var(--panel);
   color:var(--mut);font:600 12.5px/1 inherit;padding:10px 15px;cursor:pointer;white-space:nowrap;
   margin-top:5px;font-family:inherit}
 .tab[aria-selected="true"]{background:var(--bg);color:var(--accent);
   box-shadow:inset 0 3px 0 var(--accent);margin-top:0;padding-top:15px}
 .tab:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
 @media (prefers-color-scheme:dark){
  :root{--ink:#e7ecf3;--mut:#98a1b2;--fade:#727b8c;--line:#2a313f;--bg:#12151c;--panel:#1a1f28;
   --accent:#5b9bf0;--accentb:#1c2635;--head:#1e3a63;--g1:#24487a;--g2:#1f5142;--g3:#4a3566}}
 :root[data-theme="dark"]{--ink:#e7ecf3;--mut:#98a1b2;--fade:#727b8c;--line:#2a313f;--bg:#12151c;
  --panel:#1a1f28;--accent:#5b9bf0;--accentb:#1c2635;--head:#1e3a63;--g1:#24487a;--g2:#1f5142;--g3:#4a3566}
 :root[data-theme="light"]{--ink:#151a23;--mut:#5d6675;--fade:#8b93a3;--line:#dee2e9;--bg:#fff;
  --panel:#f6f8fa;--accent:#1f4f8f;--accentb:#e8eef8;--head:#1f4f8f;--g1:#2c5f9e;--g2:#2f6b57;--g3:#6b4a86}
 @page{size:A4 portrait;margin:14mm}
 @media print{
  body{font-size:10.5px;background:#fff}.wrap{max-width:none;padding:0}
  .bar,.hint,#raw,.tabs{display:none!important}
  .panel{display:block!important;page-break-before:always}
  .panel:first-of-type{page-break-before:avoid}
  h1{font-size:17px}h2{font-size:14px}
  table{font-size:9px}th,td{padding:3px 6px}
  thead{display:table-header-group}tr{page-break-inside:avoid}
  .note,dd,.arith{break-inside:avoid}.scroll{overflow:visible}
  a{text-decoration:none;color:inherit}
 }
</style></head><body><div class="wrap">

<div class="masthead">
  <div><h1>AscendOS &mdash; Hardware Requirements</h1>
  <p class="for">Prepared for ShiftIT &middot; what the software needs, not what to buy</p></div>
  <div class="meta">Code Compass ${U} searches / seat / day<br>
  Code Inspector ${I} scans / user / day<br>20&ndash;840 seats</div>
</div>

<div class="bar">
  <a class="btn" id="dx" download="AscendOS-Hardware-Requirements.xlsx">Download Excel workbook</a>
  <button class="btn alt" id="pr">Print / save as PDF</button>
  <a class="btn alt" id="dl" download="AscendOS-Hardware-Requirements.csv">CSV</a>
  <button class="btn alt" id="cp">Copy CSV</button>
  <button class="btn alt" id="sh">Show raw CSV</button>
</div>
<p class="hint">The workbook carries the same four sheets. Printing outputs every tab, each starting on
its own page. If a download does nothing, this page is inside a sandbox that blocks them &mdash; use
<b>Copy CSV</b> instead.</p>
<textarea id="raw" spellcheck="false" hidden></textarea>

<section class="panel on" id="p-start">
  <h2>Start here</h2>
  <p class="lede">This says what AscendOS needs in order to run, at a range of load levels. It does not
  specify machines, instance types or topology &mdash; that is your call. These are the figures it has to
  add up to.</p>

  <h3>What the software does</h3>
  <p class="lede">AscendOS is browser-delivered. Code Compass answers building-code questions against an
  ingested vector index; Code Inspector analyses site photographs; the estimating modules price work.
  Every one of them is a short job that holds a CPU core for seconds and then releases it, and most of
  that time is spent waiting on an external model API rather than computing. That is why the sizing is
  driven by <b>how many jobs run at the same moment</b> &mdash; not by seat count, and not by requests per day.</p>

  <div class="note key"><b>&ldquo;Jobs at once&rdquo; &mdash; the number everything else follows from.</b>
  It is the count of searches and scans running at the same moment, averaged across the busiest hour of
  the day. <b>A value below 1 is normal</b> and simply means the work is intermittent. Worked through at
  20 seats:
  <table class="arith">
   <tr><td>20 seats &times; ${USAGE.high.compass} searches a day</td><td class="v">400 searches a day</td></tr>
   <tr><td>spread across an 8-hour working day</td><td class="v">50 an hour</td></tr>
   <tr><td>the busy hour runs at 3&times; the daily average</td><td class="v">150 an hour</td></tr>
   <tr><td>each search occupies a core for about 12 seconds</td><td class="v">150 &times; 12s = 1,800 core-seconds</td></tr>
   <tr class="tot"><td>1,800 seconds of work inside a 3,600-second hour</td><td class="v"><b>0.5 jobs at once</b></td></tr>
  </table>
  <b>It is not a fraction of a machine.</b> It describes how heavily the application tier is worked, and
  only begins to drive the requirement once it passes 1. It is also an average rather than a ceiling:
  arrivals are random, so 0.5 still produces brief moments with two or three jobs at once, and the
  platform needs the headroom to absorb them.
  <br><br>Job lengths differ by module &mdash; a Compass search runs about <b>12 seconds</b>, an Inspector photo
  scan about <b>55</b> &mdash; which is why a few hundred Inspector users move the figure more than several
  hundred extra Compass seats do.</div>

  <h3>The two scenarios</h3>
  <p class="lede"><b>Compass only</b> is every seat running Code Compass and nothing else &mdash; the light
  case. <b>All modules</b> adds 250 users running Code Inspector as well, the heaviest realistic
  configuration. Any actual deployment sits between the two. Each is shown as a range because usage is a
  range: Code Compass ${U} searches per seat per working day, Code Inspector ${I} scans per user per day.
  <b>The vCPU and RAM figures beside each range are sized on the busy end of it</b> &mdash; a platform sized on
  average usage is short on every busy day.</p>

  <div class="note"><b>What the figures cover.</b> vCPU and RAM are the <b>application tier only</b>. The
  search index is listed separately because it is a fixed working set that grows with the size of the
  code corpus rather than with load, and because it has storage requirements the application tier does
  not &mdash; see Platform requirements. <b>The two are never summed.</b>
  <br><br>Everything here is <b>capacity</b>, not availability. Redundancy and failover are a separate
  conversation and would change the shape of anything built from these numbers.</div>
</section>

<section class="panel" id="p-req">
  <h2>Requirements by load stage</h2>
  <p class="lede">Nine reference points across the range. Application tier vCPU and RAM, with the search
  index sized separately. Between these points the requirement rises smoothly &mdash; there is no threshold
  or step change anywhere in this range.</p>
  ${reqTable(STAGES)}
  <div class="note"><b>At the top of the range</b>, 840 seats with 250 Inspector users needs
  <b>${last('insp250').vcpu.toFixed(1)} vCPU and ${last('insp250').appRam.toFixed(1)} GB</b> for the application tier, plus
  <b>${last('insp250').indexGb.toFixed(1)} GB of RAM and ${last('insp250').indexDisk} GB of disk</b> for the search index. Compass alone at the same
  seat count needs ${last('compass').vcpu.toFixed(1)} vCPU and ${last('compass').appRam.toFixed(1)} GB.</div>
</section>

<section class="panel" id="p-detail">
  <h2>Full detail</h2>
  <p class="lede">The same figures at every 20 seats, if a specific number is needed. Columns are
  identical to the load stage table.</p>
  ${reqTable(SEATS)}
</section>

<section class="panel" id="p-plat">
  <h2>Platform requirements</h2>
  <p class="lede">Independent of topology. These hold whatever the deployment is built from.</p>
<dl>
<dt>Compute</dt>
<dd>The application tier is <b>stateless and scales horizontally</b> &mdash; instances hold no data between
requests and need no knowledge of each other. Adding capacity means adding instances.</dd>
<dd>No GPU. No specific CPU architecture; x64 and Arm are both acceptable. The workload is bursty and
spends most of its time waiting on external APIs, so burstable or credit-based instance families suit it
well, provided sustained utilisation stays inside whatever baseline they allow.</dd>

<dt>Storage &mdash; the one hard constraint</dt>
<dd class="hard">The search index is <b>Qdrant</b>, a vector database. It requires <b>block-level storage
with a POSIX-compatible filesystem</b>. Qdrant memory-maps its segment files, so this is not a preference.
<b>It will not run on a network filesystem</b> &mdash; NFS, SMB or CIFS &mdash; nor on object storage. Network block
protocols such as iSCSI are fine. SSD strongly preferred.</dd>
<dd>The index must also <b>fit in memory</b>: the Search index RAM column is the working set, not the disk
footprint. Disk should be roughly 1.3&times; that. Both grow with the size of the ingested code corpus rather
than with user load.</dd>
<dd><b>On Azure specifically:</b> App Service cannot satisfy this &mdash; its persistent storage is an SMB share
and its local disk does not survive a restart. Container Apps cannot either; it offers ephemeral storage
and Azure Files only. A Virtual Machine or AKS with a managed disk can. Azure AI Search is a managed
alternative, but it is an API rewrite on our side rather than a drop-in, so please treat it as a separate
discussion rather than an equivalent option.</dd>
<dd>The <b>application tier needs no persistent storage.</b> Ephemeral disk is fine, and instances do not
need a shared filesystem between them.</dd>

<dt>Network</dt>
<dd><b>Outbound HTTPS to external model APIs</b> (Google Gemini and fal.ai) is required from every
application instance. No inbound requirements beyond ordinary HTTPS.</dd>
<dd class="hard"><b>Every in-flight job holds one long-lived streaming HTTP response</b>, so concurrent
streaming connections equal the &ldquo;jobs at once&rdquo; figure. Two things follow. Any load balancer, proxy or
gateway in front of the application must allow idle connections of <b>at least 120 seconds</b> &mdash; an
Inspector scan streams for around 55, and a shorter timeout cuts the job off mid-answer. And <b>response
buffering must be disabled</b>, or results arrive in one lump at the end instead of streaming.</dd>
<dd>Where a platform limits outbound connections per instance, note that every job makes several outbound
API calls. Connection pooling is in place, but a low per-instance cap is worth raising with us early &mdash; on
Azure App Service this is the 128-SNAT-port limit, which has no metric and so cannot be autoscaled on.</dd>
<dd>Egress volume is modest: JSON responses and rendered images.</dd>

<dt>Not required</dt>
<dd>No GPU. No shared filesystem between application instances. No session affinity beyond the lifetime of
a single request. No inbound VPN or private link. No database engine to host &mdash; the application uses
managed Firestore, which sits outside anything deployed here.</dd>

<dt>Availability</dt>
<dd>Everything in this document is <b>capacity</b>. A single instance of anything is a single point of
failure; designing for high availability is a separate decision and would change these numbers.</dd>
</dl>
<p class="hint" style="margin-top:22px">Generated from the same model as our internal capacity planner,
so the two cannot disagree. ${SEATS.length} detail rows &middot; 20 to 840 seats in steps of 20.</p>
</section>

</div>
<nav class="tabs" role="tablist" aria-label="Sheets">
 <button class="tab" role="tab" aria-selected="true"  aria-controls="p-start"  data-t="start">Start here</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-req"    data-t="req">Requirements by load</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-detail" data-t="detail">Full detail</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-plat"   data-t="plat">Platform requirements</button>
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
    b.addEventListener('keydown',function(e){
      var i=tabs.indexOf(b), n=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:-1;
      if(n>=0&&n<tabs.length){tabs[n].focus();show(tabs[n].dataset.t);e.preventDefault();}
    });
  });
  document.getElementById('pr').addEventListener('click',function(){window.print()});

  var bin=atob(CSV_B64), b=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  var text=new TextDecoder('utf-8').decode(b);

  // Plain anchors: a sandboxed frame can block a scripted download silently.
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
console.log('hardware.html', (page.length/1024).toFixed(1)+'KB | 4 tabs | xlsx embedded:', xb64?(xb64.length/1024).toFixed(0)+'KB':'NO');
