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
const jobs = (lo, hi) => `<b>${lo.concurrent.toFixed(1)} &ndash; ${hi.concurrent.toFixed(1)} jobs running at once</b> means that at the
  busiest moment of the busiest hour, that many searches and scans are in flight simultaneously &mdash;
  not per day, and not the number of people signed in. The pair is a range because usage is: the
  lower figure assumes ${USAGE.low.compass} searches per seat per day, the higher assumes ${USAGE.high.compass}. Everything to the
  right of it is sized on the higher figure.`;
const at = (k,n) => data[k][SEATS.indexOf(n)];
const last = k => data[k][data[k].length-1].hi;
const lastLo = k => data[k][data[k].length-1].lo;
const splitAt = (k,b) => { const a=data[k];
  for (let i=1;i<a.length;i++) if (a[i-1][b].azVmColocated && !a[i][b].azVmColocated) return a[i].seats;
  return a[0][b].azVmColocated ? null : 20; };

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

const CONC_H = `Jobs running at once<br><span class="lt">quiet usage &rarr; busy usage</span>`;
const HW_COLS = [['Seats','t'],[CONC_H,'rng'],
  ['Web tier<br><span class="lt">size &times; how many</span>','t'],
  ['Index host<br><span class="lt">size &times; how many</span>','t'],
  ['Machines to buy<br><span class="lt">web + index</span>',''],
  ['Total vCPU<br><span class="lt">across all</span>',''],
  ['Total RAM GB<br><span class="lt">across all</span>',''],['Index<br>disk GB','']];
// Container Apps replicas are NOT machines anyone buys -- they come and go with
// traffic. Adding them to a machine count implied a standing fleet that does
// not exist. Only the index is a machine on this option.
const CA_COLS = [['Seats','t'],[CONC_H,'rng'],
  ['Peak replicas<br><span class="lt">at busiest moment</span>',''],
  ['Warm replicas<br><span class="lt">kept alive</span>',''],
  ['vCPU per<br>replica',''],['RAM GB per<br>replica',''],
  ['Index host<br><span class="lt">size &times; how many</span>','t'],
  ['Machines to buy<br><span class="lt">index only</span>','']];
const IX_COLS = [['Seats','t'],['Index<br>RAM GB',''],['Index<br>disk GB',''],
  ['Self-hosted VM<br><span class="lt">Qdrant</span>','t'],['AI Search tier<br><span class="lt">alternative</span>','t'],
  ['Partitions',''],['Vector quota<br>needed GB','']];

const WORKED_SEATS = 400;
const optionPanel = (id, letter, title, blurb, cols, cells, splitKey, foot, worked) => `
<section class="panel" id="p-${id}">
  <h2><span class="badge">${letter}</span>${title}</h2>
  <p class="lede">${blurb}</p>
  <div class="note worked"><b>How to read a row.</b> ${worked(at('insp250', WORKED_SEATS).lo, at('insp250', WORKED_SEATS).hi)}</div>
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
 .note.worked{border-left-color:#7a9a3f;background:var(--panel)}
 .note.legend dl{margin:0}
 .note.legend dt{margin-top:9px;font-size:13px}
 .note.legend dd{margin:1px 0 0}
 @media (prefers-color-scheme:dark){.note.worked{border-left-color:#9dbd5f}}
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
  <p class="for">Prepared for ShiftIT &middot; Microsoft Azure &middot; hardware specification only, no pricing</p></div>
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
  <h2><span class="badge">&#9632;</span>Start here</h2>
  <p class="lede">Three ways to run AscendOS on Azure. They are alternatives, not layers &mdash; you would
  supply one of them. Each has its own tab, carrying every seat count from 20 to 840 in steps of 20.
  Hardware is sized on the high end of the usage range, because a fleet sized on average usage is
  under-provisioned on every busy day. The two column names below are the ones worth reading first.</p>

  <div class="cards">
   <div class="card"><h4>840 seats, Compass only</h4><div class="n">${last('compass').azAppCpu} vCPU &middot; ${last('compass').azAppRam} GB</div>
    <p>${lastLo('compass').concurrent.toFixed(0)}&ndash;${last('compass').concurrent.toFixed(0)} jobs in flight at peak. ${esc(last('compass').azAppWeb)} on App Service, or ${last('compass').azVmMachines} VMs.</p></div>
   <div class="card"><h4>The index cannot share</h4><div class="n">Always separate</div>
    <p>On App Service and Container Apps the vector index needs its own machine at every seat count &mdash; neither has block storage.</p></div>
   <div class="card"><h4>200 vs 250 Inspector</h4><div class="n">Identical at 840</div>
    <p>Both need ${last('insp250').azAppMachines} machines on App Service. They differ lower down the range.</p></div>
  </div>

  <div class="note legend"><b>Two column names worth pinning down before you read the tabs.</b>
  <dl style="margin-top:7px">
   <dt>&ldquo;Jobs running at once&rdquo;</dt>
   <dd>The number of searches and scans <em>in flight at the same instant</em>, at the busiest moment of the
   busiest hour. Not jobs per day, and not people signed in &mdash; a search holds a CPU core for a second or
   two and then lets go, so this is what actually determines how much hardware you need. It is shown as a
   range because usage is a range: the lower number assumes ${USAGE.low.compass} searches per seat per day, the higher
   assumes ${USAGE.high.compass}. <b>Every machine figure is sized on the higher one.</b></dd>
   <dt>&ldquo;Machines to buy&rdquo;</dt>
   <dd>Physical things ShiftIT would provision, added up: the application tier plus the search index host.
   On App Service and Container Apps the index is always its own machine, so it is always at least +1.
   On Container Apps the replicas are <em>not</em> counted &mdash; the platform starts and stops those on its own,
   and only the index is a standing machine.</dd>
  </dl></div>

  <div class="note"><b>Does Azure change the requirement? No.</b> Peak concurrency, cores, memory and
  disk are properties of the workload, not the vendor &mdash; those columns are identical whoever hosts it.
  What Azure changes is the ladder of purchasable units, and two things about the deployment&rsquo;s shape:
  the search index can never share a machine on options A or C, and App Service Standard&rsquo;s 10-instance
  cap makes Premium v3 the tier for this range.</div>

  <div class="note"><b>Where the index needs its own machine on Option B</b>, the only option where it
  can share at all. On A and C it is separate from the first seat.
  <div class="scroll"><table style="max-width:620px;margin-top:9px">
  <thead><tr><th class="t">Scenario</th><th>Low usage (${USAGE.low.compass}/${USAGE.low.inspector} per day)</th><th>High usage (${USAGE.high.compass}/${USAGE.high.inspector} per day)</th></tr></thead>
  <tbody>${SCENARIOS.map(sc=>`<tr><td class="t">${esc(sc.title)}</td><td>${splitAt(sc.key,'lo')||'&mdash;'} seats</td><td>${splitAt(sc.key,'hi')||'&mdash;'} seats</td></tr>`).join('')}</tbody></table></div></div>
</section>

${optionPanel('a','A','App Service &mdash; managed platform (PaaS)',
 'Premium v3 instances behind the platform&rsquo;s own load balancer. Premium rather than Standard is deliberate: HTTP-driven autoscaling is Premium-only, Standard cannot be made zone-redundant, and Standard caps at 10 instances &mdash; a ceiling this range reaches. P0v3 (1 vCPU / 4 GB) is the scaling unit because 1-core steps waste the least; <b>P1v3 or P2v3 substitute directly at half or a quarter of the count.</b> The search index is always a separate machine here &mdash; see the Search index tab.',
 HW_COLS, r => { const h=r.hi; return [`<b>${r.seats}</b>`, ...conc(r), esc(h.azAppWeb), esc(h.azAppIdx), h.azAppMachines, h.azAppCpu, h.azAppRam, h.indexDisk]; },
 null,
 'Instance count stays well inside the 30-instance Premium v3 limit across this whole range. Zone redundancy, if required, enforces a minimum of two instances and bills for both.',
 (lo,hi) => `Take the <b>${WORKED_SEATS}-seat</b> row. ${jobs(lo,hi)}
  To carry that you run <b>${esc(hi.azAppWeb)}</b> &mdash; ${hi.azAppWeb.split(' x')[1]} App Service instances, each 1 vCPU and 4 GB &mdash;
  and <b>one separate VM</b> (${esc(hi.azAppIdx)}) holding the search index, because App Service cannot store it.
  So you are buying <b>${hi.azAppMachines} machines</b> in total: ${hi.azAppWeb.split(' x')[1]} for the app plus 1 for the index.
  Added up that is <b>${hi.azAppCpu} vCPU and ${hi.azAppRam} GB</b>.`)}

${optionPanel('b','B','Virtual Machines &mdash; raw infrastructure',
 'Bsv2 burstable VMs, the right family for this workload: short CPU spikes on a low average. B2s_v2 and larger bank credits at a 40% base, and average utilisation here sits well below that, so credits accumulate rather than drain. <b>Note there is no Azure equivalent of AWS &ldquo;Unlimited&rdquo; mode</b> &mdash; an exhausted credit bank throttles to base and cannot be bought past. Sized for fewest machines, since operating them is the real cost of this option.',
 HW_COLS, r => { const h=r.hi; return [`<b>${r.seats}</b>`, ...conc(r), esc(h.azVmWeb), esc(h.azVmIdx), h.azVmMachines, h.azVmCpu, h.azVmRam, h.indexDisk]; },
 'azVmColocated',
 'Shaded rows are where the search index moves onto its own VM. This is the only option of the three where it can share the web machine at all, because it is the only one with block storage.',
 (lo,hi) => `Take the <b>${WORKED_SEATS}-seat</b> row. ${jobs(lo,hi)}
  To carry that you run <b>${esc(hi.azVmWeb)}</b> for the application${hi.azVmColocated
    ? `, with the search index sitting on that same server &mdash; still small enough to fit`
    : `, plus <b>${esc(hi.azVmIdx)}</b> holding the search index on its own`}.
  So you are buying <b>${hi.azVmMachines} machine${hi.azVmMachines>1?'s':''}</b>, totalling
  <b>${hi.azVmCpu} vCPU and ${hi.azVmRam} GB</b>.`)}

${optionPanel('c','C','Container Apps &mdash; request-scaled containers',
 'Replicas exist only while requests are in flight and scale to zero. Allocation is fixed at a 1 vCPU : 2 GiB ratio, capped at 4 vCPU / 8 GiB per replica. <b>This option is unavoidably a hybrid:</b> Container Apps offers only ephemeral storage and Azure Files, so the search index cannot live here and needs its own machine regardless. Replica count follows a configured concurrency threshold, not a platform limit &mdash; Container Apps has no per-replica request cap.',
 CA_COLS, r => { const h=r.hi; return [`<b>${r.seats}</b>`, ...conc(r), h.azCaPeak, h.azCaWarm, 1, 2, esc(h.azCaIdx), h.azCaMachines - h.azCaPeak]; },
 null,
 'One replica absorbs this whole range at the assumed 45 concurrent requests per replica. For availability rather than capacity, run at least two.',
 (lo,hi) => `Take the <b>${WORKED_SEATS}-seat</b> row. ${jobs(lo,hi)}
  Container Apps starts and stops replicas by itself as traffic moves, so <b>you do not buy replicas</b> &mdash;
  <b>${hi.azCaPeak}</b> is simply how many are running at the busiest moment, each 1 vCPU and 2 GB.
  The only machine you actually buy on this option is the one holding the search index
  (<b>${esc(hi.azCaIdx)}</b>), because Container Apps has nowhere to store it.
  So: <b>${hi.azCaMachines - hi.azCaPeak} standing machine</b>, and the web tier bills by traffic instead.`)}

<section class="panel" id="p-index">
  <h2><span class="badge">&#9679;</span>Search index &mdash; the one real decision</h2>
  <p class="lede">Code Compass answers against a vector index of the ingested building codes. It is
  currently Qdrant, self-hosted. On Azure this is the only part of the platform where the hosting
  choice is forced rather than preferred, so it is worth deciding deliberately.</p>

  <div class="note"><b>Qdrant requires block-level storage with a POSIX filesystem, and explicitly
  does not run on network filesystems.</b> That single requirement rules out two of the three
  options above as a home for it:
  <ul style="margin:8px 0 0;padding-left:20px">
   <li><b>App Service</b> &mdash; persistent <code>/home</code> is an SMB share, which cannot take the
   exclusive file locks a database needs; local disk does not survive a restart. No configuration
   gives durable, lockable and adequately sized disk together.</li>
   <li><b>Container Apps</b> &mdash; offers ephemeral storage and Azure Files (SMB/NFS) only. No block
   storage exists. Ephemeral volumes are destroyed on every scale-in and revision change.</li>
   <li><b>Virtual Machines or AKS</b> &mdash; managed disks are block storage. Either works.</li>
  </ul></div>

  <div class="note"><b>There is no first-party managed Qdrant on Azure.</b> The Marketplace listing
  is Qdrant Cloud, operated by Qdrant Solutions GmbH on their own infrastructure and sold through
  Marketplace for billing convenience &mdash; it does not deploy into your subscription. The Container Apps
  add-on that previously offered Qdrant in preview has been retired.</div>

  <h3>The two viable routes</h3>
  <p class="sub">Both are shown per seat count below. They are alternatives, not additions.</p>
  <div class="scroll">${(() => {
    const rows = data.insp250;
    return `<table><thead><tr>${IX_COLS.map(c=>`<th${c[1]?` class="${c[1]}"`:''}>${c[0]}</th>`).join('')}</tr></thead><tbody>
${rows.map(r => { const h=r.hi; return `<tr><td class="t"><b>${r.seats}</b></td><td>${h.indexGb.toFixed(1)}</td><td>${h.indexDisk}</td>
  <td class="t">${esc(h.azCaIdx)}</td><td class="t">${esc(h.azSearchTier)}</td><td>${h.azSearchPart}</td><td>${h.azSearchGb.toFixed(1)}</td></tr>`;}).join('\n')}
</tbody></table>`; })()}</div>

  <dl>
  <dt>Route 1 &mdash; keep Qdrant, on a VM or AKS</dt><dd>No application change. A single burstable VM
  with a Premium SSD data disk covers this entire range; AKS with <code>managed-csi-premium</code> is the
  same thing with orchestration. The index must fit in memory, which is what the Index RAM column
  sizes. Note that VM disk IOPS are capped by <em>both</em> disk size and VM size &mdash; a larger disk does
  nothing if the VM tier is the bottleneck.</dd>

  <dt>Route 2 &mdash; Azure AI Search</dt><dd>Fully managed, native vector and hybrid search, no machine
  to operate. The governing limit is the vector index quota per partition, which is a memory limit on
  the graph &mdash; not the larger storage quota. Sizing allows for graph overhead and deleted-document
  slack on top of the raw vectors, which is why the quota needed exceeds the index RAM figure.
  <b>This is an API rewrite, not a drop-in replacement for the Qdrant client</b> &mdash; the cost is
  engineering time, not hardware.</dd>

  <dt>Which tier</dt><dd>Basic carries 5 GB of vector quota per partition and covers this range until
  the index approaches that ceiling, at which point S1 (35 GB) is the next single-partition step.
  Sharding a smaller tier across partitions reaches the same quota but is a more fragile deployment
  for no benefit; the table above always shows the smallest tier that fits on one partition.</dd>

  <dt>Regional caveat</dt><dd>The higher post-2024 quotas are not available in every region &mdash; Israel
  Central, Qatar Central, Spain Central and South India remain on the older, smaller limits. Confirm
  the target region before committing to a tier.</dd>
  </dl>
</section>

<section class="panel" id="p-notes">
  <h2><span class="badge">?</span>Assumptions &amp; method</h2>
  <p class="lede">Everything the numbers depend on, stated plainly. If any of it is wrong for the
  deployment you have in mind, the figures move accordingly.</p>
<dl>
<dt>What the workload is</dt><dd>AscendOS is browser-delivered. Code Compass answers building-code
questions against an ingested vector corpus; Code Inspector analyses site photographs. Both are short,
bursty jobs that hold a CPU core briefly and release it, so the fleet is sized on how many run at
the same instant &mdash; not on seat count. Both spend most of their time waiting on a model API rather
than computing, which is why concurrency rather than raw compute drives the sizing.</dd>

<dt>What does <em>not</em> change with the vendor</dt><dd>Peak concurrency, required cores, required
memory and index size are properties of the workload. They would be identical on any provider. Only
the ladder of purchasable units changes &mdash; plus, on Azure, two constraints on the deployment&rsquo;s shape:
the index cannot share a machine on App Service or Container Apps, and Standard&rsquo;s instance cap forces
Premium for this range.</dd>

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

<dt>Azure-specific constraints reflected in these tables</dt><dd>App Service Premium v3 is used
throughout rather than Standard: HTTP-driven autoscaling is Premium-only, Standard cannot be made
zone-redundant, and Standard caps at 10 instances. Premium v4 exists and is GA, but its vCPU and RAM
are identical to v3 &mdash; the gain is faster processors and NVMe local storage, so <b>no extra capacity
should be budgeted for v4</b>. Note Premium v4 has no stable outbound IP addresses; if anything
downstream IP-allowlists us, that requires a NAT Gateway or staying on v3.</dd>

<dt>Why Bsv2 for the VM option</dt><dd>The workload is short spikes on a low average, which is
exactly what burstable credits are for. B2s_v2 and larger bank at a 40% base and average utilisation
here sits well below it, so credits accumulate rather than drain. Two cautions: the original Bs-series
is retiring in November 2028 and has no 1-vCPU successor, and there is no Azure equivalent of AWS
&ldquo;Unlimited&rdquo; mode &mdash; an exhausted bank throttles to base and cannot be bought past.</dd>

<dt>Things to confirm against your own subscription</dt><dd>Regional vCPU quota is not published by
Microsoft and varies by subscription type, age and region; a new subscription can have very low or
zero quota in a given region. Quota and capacity are also checked separately, so sufficient quota does
not guarantee the region has the sizes available. Confirm before committing to a region.</dd>

<dt>A known Azure surprise worth designing around</dt><dd>Each App Service instance gets only 128
preallocated SNAT ports, and closed connections are not reclaimed for four minutes. An application
that opens connections rapidly to the same host exhausts this and sees intermittent 5xx errors. There
is no metric for it, so it cannot be autoscaled on. Connection pooling, private endpoints or a NAT
Gateway are the mitigations. Relevant here because every job calls out to a model API.</dd>

<dt>What is not here</dt><dd>Pricing, of any kind. Also excluded: high availability and redundancy,
which is a separate decision that would at minimum double the web tier; developer and staging
environments; CI; and off-site backup targets. This is the production serving fleet only.</dd>

</dl>
<p class="foot">Generated from the same model as the interactive planner, so the two cannot disagree.
${SEATS.length} rows per scenario &middot; 20 to 840 seats in steps of 20.</p>
</section>

</div>
<nav class="tabs" role="tablist" aria-label="Worksheets">
 <button class="tab" role="tab" aria-selected="true"  aria-controls="p-summary" data-t="summary">Start here</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-a" data-t="a">A &middot; App Service</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-b" data-t="b">B &middot; Virtual Machines</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-c" data-t="c">C &middot; Container Apps</button>
 <button class="tab" role="tab" aria-selected="false" aria-controls="p-index" data-t="index">Search index</button>
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
