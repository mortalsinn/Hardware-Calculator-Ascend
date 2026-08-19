#!/usr/bin/env node
// ========================================================
// build-hardware.js — generates hardware.html and hardware.csv
//
// HARDWARE SPECIFICATION ONLY. No pricing: this document answers
// "what machines do we need", and money is the interactive planner's
// job. Mixing them made the boss read a spec sheet as a quote.
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
const M = eval(js + '\n;({calc, calcServerless, calcVps})');

const posFor = n => Math.log10(Math.max(1, n)) / 6 * 1000;

// A subset of seats running Inspector is expressed as an equivalent
// fleet-wide rate. The model is linear in job volume, so 200 users at 5
// scans/day yields exactly the same total scans and concurrency.
function row(seats, inspectorSeats, inspectorPerDay) {
  Object.assign(vals, {
    seats: String(posFor(seats)),
    comp: '5', insp: '0', est: '0', tend: '0',
    peak: '30', reg: '1', warm: '1', fx: '1.17',
    fIn: '0.75', fOut: '3.75', pIn: '2.00', pOut: '12.00', sam: '0.004',
  });
  if (inspectorSeats > 0) vals.insp = String((inspectorSeats * inspectorPerDay) / seats);

  const d = M.calc();
  const sv = M.calcServerless(d);
  const vp = M.calcVps(d);

  // Serverless instances are a fixed shape: 1 vCPU / 2 GiB each.
  const svInst = Math.max(sv.peakInst, sv.minInst);

  // TOTALS MUST COUNT THE WHOLE FLEET, INCLUDING THE INDEX HOST.
  //
  // Past a threshold the search index stops sharing the web box and moves to
  // its own machine. That FREES memory on the web tier, so the web instance
  // count can legitimately fall. Counting only web instances therefore showed
  // hardware SHRINKING as load grew (780 seats read as less than 760) — the
  // new index machine was simply missing from the total.
  const mgIdx = d.qdr;                 // null when colocated
  const vpIdx = vp.qdrBox;             // null when colocated

  return {
    seats,
    concurrent: d.peakConc,
    vcpu: d.needCpu,
    appRam: d.needRam,
    indexGb: d.qGb,
    indexDisk: d.diskGb,

    // Option A - managed platform (Render)
    mgColocated: !mgIdx,
    mgWeb: `${d.web.plan.n} x${d.web.count}`,
    mgIndex: mgIdx ? `${mgIdx.plan.n} x${mgIdx.count}` : 'on web instance',
    mgMachines: d.web.count + (mgIdx ? mgIdx.count : 0),
    mgCpu: d.web.plan.cpu * d.web.count + (mgIdx ? mgIdx.plan.cpu * mgIdx.count : 0),
    mgRam: d.web.plan.ram * d.web.count + (mgIdx ? mgIdx.plan.ram * mgIdx.count : 0),

    // Option B - raw VPS (Hetzner)
    vpColocated: !vpIdx,
    vpWeb: `${vp.web.plan.n} x${vp.web.count}`,
    vpIndex: vpIdx ? `${vpIdx.plan.n} x${vpIdx.count}${vpIdx.sharded ? ' sharded' : ''}` : 'on web server',
    vpMachines: vp.servers,
    vpCpu: vp.web.plan.cpu * vp.web.count + (vpIdx ? vpIdx.plan.cpu * vpIdx.count : 0),
    vpRam: vp.web.plan.ram * vp.web.count + (vpIdx ? vpIdx.plan.ram * vpIdx.count : 0),

    // Option C - serverless (Cloud Run), 1 vCPU / 2 GB per instance
    svPeak: svInst, svWarm: sv.minInst,
    svCpu: svInst * 1, svRam: svInst * 2,
    svIndex: 'managed service',
  };
}

const SEATS = [];
for (let n = 20; n <= 840; n += 20) SEATS.push(n);

const SCENARIOS = [
  { key: 'compass', title: 'Code Compass only',
    sub: 'Every seat runs 5 Code Compass searches per working day.', insp: 0 },
  { key: 'insp200', title: 'Code Compass, plus 200 Code Inspector users',
    sub: 'All seats run Compass. 200 of them also run Code Inspector 5 times per working day.', insp: 200 },
  { key: 'insp250', title: 'Code Compass, plus 250 Code Inspector users',
    sub: 'All seats run Compass. 250 of them also run Code Inspector 5 times per working day.', insp: 250 },
];

const data = {};
for (const sc of SCENARIOS) data[sc.key] = SEATS.map(n => row(n, Math.min(sc.insp, n), 5));

// ---------------------------------------------------------------- CSV
const HEAD = ['Seats','Peak concurrent jobs','vCPU required','App RAM required (GB)','Search index RAM (GB)','Search index disk (GB)',
  'MANAGED: web instances','MANAGED: index host','MANAGED: total machines','MANAGED: total vCPU','MANAGED: total RAM (GB)',
  'VPS: web servers','VPS: index host','VPS: total machines','VPS: total vCPU','VPS: total RAM (GB)',
  'SERVERLESS: peak instances','SERVERLESS: warm instances','SERVERLESS: peak vCPU','SERVERLESS: peak RAM (GB)','SERVERLESS: search index'];
const csv = [];
csv.push('AscendOS - Hardware Requirements by Seat Count');
csv.push('Hardware specification only. Three deployment options: Managed platform (Render), Raw VPS (Hetzner), Serverless (Google Cloud Run).');
csv.push('Assumes 5 Code Compass searches per seat per working day. Peak hour sized at 3x the daily average.');
csv.push('Required = computed need. Totals include the search index host, which becomes its own machine past a threshold.');
csv.push('');
for (const sc of SCENARIOS) {
  csv.push(sc.title);
  csv.push(sc.sub);
  csv.push(HEAD.join(','));
  for (const r of data[sc.key]) {
    csv.push([r.seats, r.concurrent.toFixed(2), r.vcpu.toFixed(2), r.appRam.toFixed(2), r.indexGb.toFixed(2), r.indexDisk,
      `"${r.mgWeb}"`, `"${r.mgIndex}"`, r.mgMachines, r.mgCpu, r.mgRam,
      `"${r.vpWeb}"`, `"${r.vpIndex}"`, r.vpMachines, r.vpCpu, r.vpRam,
      r.svPeak, r.svWarm, r.svCpu, r.svRam, `"${r.svIndex}"`].join(','));
  }
  csv.push('');
}
const CSV = csv.join('\n');
fs.writeFileSync(path.join(__dirname, 'hardware.csv'), CSV);
module.exports = { SEATS, SCENARIOS, data, CSV, HEAD };
console.log('rows/scenario:', SEATS.length, '| csv bytes:', CSV.length);
for (const sc of SCENARIOS) {
  const r = data[sc.key][data[sc.key].length - 1];
  console.log(`  ${sc.title.padEnd(46)} @840  conc ${r.concurrent.toFixed(1).padStart(5)} | ` +
    `managed ${String(r.mgMachines).padStart(2)} mach ${String(r.mgCpu).padStart(2)}cpu/${String(r.mgRam).padStart(3)}gb | ` +
    `vps ${String(r.vpMachines).padStart(2)} mach ${String(r.vpCpu).padStart(2)}cpu/${String(r.vpRam).padStart(3)}gb | sv ${r.svPeak} inst`);
}
