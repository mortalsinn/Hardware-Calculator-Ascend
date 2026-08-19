#!/usr/bin/env node
// ========================================================
// build-hardware.js — generates hardware.html and hardware.csv
//
// Reads the model out of index.html so the static tables can never
// disagree with the interactive page. Re-run after any model change:
//   node build-hardware.js
// ========================================================
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
let js = html.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const vals = {};
global.document = {
  getElementById: id => ({
    get value() { return vals[id]; }, set value(v) { vals[id] = String(v); },
    set innerHTML(v) {}, set textContent(v) {}, addEventListener() {},
    dataset: {}, classList: { toggle() {} }, style: {},
  }),
  querySelectorAll: () => [],
};
const M = eval(js + '\n;({calc, calcServerless, calcVps, posFromSeats})');

// Seats are a log slider on page 1; this needs exact values, so the position
// is solved back from the seat count rather than snapped to a slider step.
const posFor = n => Math.log10(Math.max(1, n)) / 6 * 1000;

/**
 * One row of the table.
 * inspectorSeats: how many of the total ALSO run Code Inspector. The model is
 * linear in job volume, so a subset at 5/day is expressed as an equivalent
 * fleet-wide rate — same total scans, same concurrency, no fiction.
 */
function row(seats, inspectorSeats, inspectorPerDay) {
  Object.assign(vals, {
    seats: String(posFor(seats)),
    comp: '5', insp: '0', est: '0', tend: '0',
    peak: '30', reg: '1', warm: '1', fx: '1.17',
    fIn: '0.75', fOut: '3.75', pIn: '2.00', pOut: '12.00', sam: '0.004',
  });
  if (inspectorSeats > 0) {
    vals.insp = String((inspectorSeats * inspectorPerDay) / seats);
  }
  const d = M.calc();
  return {
    seats,
    concurrent: d.peakConc,
    vcpu: d.needCpu,
    // App RAM and index RAM are reported SEPARATELY. Summing them hid a real
    // transition: when the index moves to its own instance the app's figure
    // drops, which read as "more load, less memory" in a single column.
    appRam: d.needRam,
    colocated: d.colocated,
    plan: `${d.web.plan.n} x${d.web.count}`,
    planCpu: d.web.plan.cpu * d.web.count,
    planRam: d.web.plan.ram * d.web.count,
    indexGb: d.qGb,
    shape: d.colocated ? 'App + index on one instance' : 'Index on its own instance',
    infra: d.infraCost,
    ai: d.aiCost,
    total: d.total,
  };
}

const SEATS = [];
for (let n = 20; n <= 840; n += 20) SEATS.push(n);

const SCENARIOS = [
  { key: 'compass', title: 'Code Compass only',
    sub: 'Every seat runs 5 Compass searches per working day. No Inspector, no Estimating.',
    insp: 0 },
  { key: 'insp200', title: 'Code Compass + 200 Inspector users',
    sub: 'All seats run Compass. 200 of them also run Code Inspector 5 times per working day.',
    insp: 200 },
  { key: 'insp250', title: 'Code Compass + 250 Inspector users',
    sub: 'All seats run Compass. 250 of them also run Code Inspector 5 times per working day.',
    insp: 250 },
];

const data = {};
for (const sc of SCENARIOS) {
  data[sc.key] = SEATS.map(n => row(n, Math.min(sc.insp, n), 5));
}
fs.writeFileSync(path.join(__dirname, '_hwdata.json'), JSON.stringify({ SEATS, SCENARIOS, data }, null, 1));
console.log('rows per scenario:', SEATS.length);
for (const sc of SCENARIOS) {
  const r = data[sc.key][data[sc.key].length - 1];
  console.log(`  ${sc.title.padEnd(38)} @840: ${r.concurrent.toFixed(1).padStart(6)} concurrent · ` +
    `${r.vcpu.toFixed(1).padStart(5)} vCPU · ${r.appRam.toFixed(1).padStart(5)} GB app + ${r.indexGb.toFixed(1)} GB index · ` +
    `${r.plan.padEnd(16)} · $${r.total.toFixed(0)}/mo`);
}

// ---------------------------------------------------------------- CSV
const money = n => n.toFixed(2);
const csv = [];
csv.push('AscendOS - Hardware Requirements by Seat Count');
csv.push('Generated from the AscendOS cost model. Managed platform (Render) sizing.');
csv.push('Assumes 5 Code Compass searches per seat per working day; peak hour 3x the average.');
csv.push('');
for (const sc of SCENARIOS) {
  csv.push(sc.title);
  csv.push(sc.sub);
  csv.push(['Seats','Peak concurrent scans','vCPU required','App RAM (GB)','Search index RAM (GB)',
            'Recommended instances','Provisioned vCPU','Provisioned RAM (GB)','Deployment shape',
            'Infrastructure USD/mo','AI usage USD/mo','Total USD/mo','Total per seat USD/mo'].join(','));
  for (const r of data[sc.key]) {
    csv.push([r.seats, r.concurrent.toFixed(2), r.vcpu.toFixed(2), r.appRam.toFixed(2), r.indexGb.toFixed(2),
      `"${r.plan}"`, r.planCpu, r.planRam, `"${r.colocated ? 'App + index on one instance' : 'Index on its own instance'}"`,
      money(r.infra), money(r.ai), money(r.total), money(r.total / r.seats)].join(','));
  }
  csv.push('');
}
fs.writeFileSync(path.join(__dirname, 'hardware.csv'), csv.join('\n'));

// ---------------------------------------------------------------- HTML
const f1 = n => n.toFixed(1);
const usd = n => '$' + Math.round(n).toLocaleString();
const tbl = (sc) => {
  const rows = data[sc.key];
  let prevPlan = null;
  const body = rows.map(r => {
    const changed = prevPlan && r.plan !== prevPlan;
    prevPlan = r.plan;
    return `<tr${changed ? ' class="step"' : ''}>
      <td class="n">${r.seats}</td>
      <td class="n">${f1(r.concurrent)}</td>
      <td class="n">${f1(r.vcpu)}</td>
      <td class="n">${f1(r.appRam)}</td>
      <td class="n">${f1(r.indexGb)}</td>
      <td>${r.plan}</td>
      <td class="n">${r.planCpu}</td>
      <td class="n">${r.planRam}</td>
      <td class="n">${usd(r.infra)}</td>
      <td class="n">${usd(r.ai)}</td>
      <td class="n tot">${usd(r.total)}</td>
    </tr>`;
  }).join('');
  const last = rows[rows.length - 1];
  return `<h2>${sc.title}</h2>
  <p class="sub">${sc.sub}</p>
  <div class="hl">At 840 seats: <b>${f1(last.concurrent)}</b> scans running at once ·
    <b>${last.plan}</b> (${last.planCpu} vCPU / ${last.planRam} GB provisioned) ·
    search index <b>${f1(last.indexGb)} GB</b> · <b>${usd(last.total)}/month</b>
    (<b>${usd(last.total / last.seats)}</b> per seat)</div>
  <div class="scroll"><table>
    <thead><tr>
      <th>Seats</th><th>Peak concurrent</th><th>vCPU req.</th><th>App RAM GB</th><th>Index RAM GB</th>
      <th>Instances</th><th>Prov. vCPU</th><th>Prov. RAM</th><th>Infra $/mo</th><th>AI $/mo</th><th>Total $/mo</th>
    </tr></thead><tbody>${body}</tbody></table></div>`;
};

const page = `<title>AscendOS · Hardware Requirements</title>
<style>
 :root{--paper:#fff;--ink:#111820;--muted:#5d6b7a;--line:#d7dee7;--accent:#e2661a;--band:#f4f7fa;--step:#fff4ec}
 @media(prefers-color-scheme:dark){:root{--paper:#0d1219;--ink:#e4eaf1;--muted:#8a99a9;--line:#243140;--accent:#f5822f;--band:#151d27;--step:#231a12}}
 :root[data-theme="dark"]{--paper:#0d1219;--ink:#e4eaf1;--muted:#8a99a9;--line:#243140;--accent:#f5822f;--band:#151d27;--step:#231a12}
 :root[data-theme="light"]{--paper:#fff;--ink:#111820;--muted:#5d6b7a;--line:#d7dee7;--accent:#e2661a;--band:#f4f7fa;--step:#fff4ec}
 *{box-sizing:border-box}
 body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:30px 18px 60px}
 .wrap{max-width:1180px;margin:0 auto}
 .eyebrow{font:700 11px/1 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
 h1{font-size:clamp(22px,3.4vw,30px);margin:10px 0 8px;letter-spacing:-.02em;font-weight:800;text-wrap:balance}
 h2{font-size:17px;margin:38px 0 4px;font-weight:800;letter-spacing:-.01em}
 .lede{color:var(--muted);max-width:70ch;margin:0}
 .sub{color:var(--muted);margin:0 0 10px;font-size:13px}
 .hl{background:var(--band);border:1px solid var(--line);border-left:4px solid var(--accent);
     border-radius:8px;padding:11px 14px;margin:0 0 12px;font-size:13.5px}
 .scroll{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
 table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
 th,td{padding:6px 11px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
 th{position:sticky;top:0;background:var(--band);font-size:10px;letter-spacing:.07em;text-transform:uppercase;
    color:var(--muted);font-weight:700}
 td.n{text-align:right;font-family:ui-monospace,monospace}
 td.tot{font-weight:700}
 tr.step{background:var(--step)}
 tr.step td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
 tbody tr:last-child td{border-bottom:0}
 .btn{display:inline-block;margin:16px 8px 0 0;padding:9px 16px;border-radius:8px;border:1px solid var(--accent);
      background:var(--accent);color:#fff;font:700 13px system-ui;cursor:pointer;text-decoration:none}
 .btn.alt{background:transparent;color:var(--accent)}
 footer{margin-top:34px;color:var(--muted);font-size:12.5px;max-width:78ch;line-height:1.6}
 @media print{.btn{display:none}body{padding:0}th{position:static}.hl{break-inside:avoid}}
</style>
<div class="wrap">
 <div class="eyebrow">AscendOS · Capacity Planning</div>
 <h1>Hardware requirements by seat count</h1>
 <p class="lede">Server sizing for Code Compass from 20 to 840 seats, in steps of 20, with two scenarios
 layering Code Inspector on top. Figures are produced by the same model as the interactive planner, so the
 two cannot disagree. Sizing shown is for the managed-platform option (Render); the highlighted rows are the
 points where another instance is required.</p>
 <a class="btn" href="hardware.csv" download>Download spreadsheet (CSV)</a>
 <a class="btn alt" href="index.html">Open the interactive planner</a>
 ${SCENARIOS.map(tbl).join('\n')}
 <footer><b>Method.</b> Every seat is assumed to run 5 Code Compass searches per working day; the Inspector
 scenarios add 5 scans per day for the stated number of users. Concurrency is derived from job arrival rate
 and how long each scan holds its connection, sized against a peak hour three times the daily average.
 &ldquo;vCPU required&rdquo; and &ldquo;App RAM&rdquo; are the computed need; &ldquo;Instances&rdquo; is the
 smallest sensible allocation that covers it, which is why provisioned capacity exceeds the requirement.
 The search index is held in memory and sits on the application instances until it no longer fits, at which
 point it moves to its own. Costs are in US dollars at published August 2026 rates. Regenerate with
 <code>node build-hardware.js</code>.</footer>
</div>`;
fs.writeFileSync(path.join(__dirname, 'hardware.html'), page);
console.log('wrote hardware.html and hardware.csv');
