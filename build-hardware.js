#!/usr/bin/env node
// ========================================================
// build-hardware.js — generates hardware.html and hardware.csv
//
// HARDWARE SPECIFICATION ONLY. No pricing: this document answers "what
// machines do we need". Money is the interactive planner's job.
//
// USAGE IS A RANGE, NOT A NUMBER. Compass runs 15-20 searches per seat
// per working day; Inspector 5-7 scans per user per day. Every row is
// therefore computed TWICE. Hardware is sized on the HIGH bound — you
// provision for the busy day, not the average one — while the low bound
// is shown alongside so the sensitivity is visible rather than implied.
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

const USAGE = {
  low:  { compass: 15, inspector: 5 },
  high: { compass: 20, inspector: 7 },
};

const posFor = n => Math.log10(Math.max(1, n)) / 6 * 1000;

// A subset of users running Inspector is expressed as an equivalent
// fleet-wide rate: the model is linear in job volume, so 200 users at 7
// scans/day is exactly the same total work — and the same concurrency —
// as the equivalent average spread across all seats.
function shape(seats, inspectorSeats, u) {
  Object.assign(vals, {
    seats: String(posFor(seats)),
    comp: String(u.compass), insp: '0', est: '0', tend: '0',
    peak: '30', reg: '1', warm: '1', fx: '1.17',
    fIn: '0.75', fOut: '3.75', pIn: '2.00', pOut: '12.00', sam: '0.004',
  });
  if (inspectorSeats > 0) vals.insp = String((inspectorSeats * u.inspector) / seats);

  const d = M.calc();
  const sv = M.calcServerless(d);
  const vp = M.calcVps(d);
  const svInst = Math.max(sv.peakInst, sv.minInst);

  // TOTALS MUST COUNT THE WHOLE FLEET, INCLUDING THE INDEX HOST.
  // Past a threshold the index stops sharing the web box and moves to its
  // own machine, which FREES memory on the web tier — so the web count can
  // fall. Counting only web instances made hardware appear to SHRINK as
  // load grew; the new index machine was simply missing from the total.
  const mgIdx = d.qdr, vpIdx = vp.qdrBox;

  return {
    concurrent: d.peakConc, vcpu: d.needCpu, appRam: d.needRam,
    indexGb: d.qGb, indexDisk: d.diskGb,

    mgColocated: !mgIdx,
    mgWeb: `${d.web.plan.n} x${d.web.count}`,
    mgIndex: mgIdx ? `${mgIdx.plan.n} x${mgIdx.count}` : 'on web instance',
    mgMachines: d.web.count + (mgIdx ? mgIdx.count : 0),
    mgCpu: d.web.plan.cpu * d.web.count + (mgIdx ? mgIdx.plan.cpu * mgIdx.count : 0),
    mgRam: d.web.plan.ram * d.web.count + (mgIdx ? mgIdx.plan.ram * mgIdx.count : 0),

    vpColocated: !vpIdx,
    vpWeb: `${vp.web.plan.n} x${vp.web.count}`,
    vpIndex: vpIdx ? `${vpIdx.plan.n} x${vpIdx.count}${vpIdx.sharded ? ' sharded' : ''}` : 'on web server',
    vpMachines: vp.servers,
    vpCpu: vp.web.plan.cpu * vp.web.count + (vpIdx ? vpIdx.plan.cpu * vpIdx.count : 0),
    vpRam: vp.web.plan.ram * vp.web.count + (vpIdx ? vpIdx.plan.ram * vpIdx.count : 0),

    svPeak: svInst, svWarm: sv.minInst, svCpu: svInst, svRam: svInst * 2,
  };
}

const row = (seats, inspectorSeats) => ({
  seats,
  lo: shape(seats, inspectorSeats, USAGE.low),
  hi: shape(seats, inspectorSeats, USAGE.high),
});

const SEATS = [];
for (let n = 20; n <= 840; n += 20) SEATS.push(n);

const SCENARIOS = [
  { key: 'compass', title: 'Code Compass only',
    sub: `Every seat runs ${USAGE.low.compass}–${USAGE.high.compass} Code Compass searches per working day.`, insp: 0 },
  { key: 'insp200', title: 'Code Compass, plus 200 Code Inspector users',
    sub: `All seats run Compass. 200 of them also run Code Inspector ${USAGE.low.inspector}–${USAGE.high.inspector} times per working day.`, insp: 200 },
  { key: 'insp250', title: 'Code Compass, plus 250 Code Inspector users',
    sub: `All seats run Compass. 250 of them also run Code Inspector ${USAGE.low.inspector}–${USAGE.high.inspector} times per working day.`, insp: 250 },
];

const data = {};
for (const sc of SCENARIOS) data[sc.key] = SEATS.map(n => row(n, Math.min(sc.insp, n)));

// ---------------------------------------------------------------- CSV
const HEAD = ['Seats',
  'Peak concurrent jobs (low usage)','Peak concurrent jobs (high usage)',
  'vCPU required (high)','App RAM required GB (high)','Search index RAM GB','Search index disk GB',
  'MANAGED: web instances','MANAGED: index host','MANAGED: total machines','MANAGED: total vCPU','MANAGED: total RAM GB',
  'VPS: web servers','VPS: index host','VPS: total machines','VPS: total vCPU','VPS: total RAM GB',
  'SERVERLESS: peak instances','SERVERLESS: warm instances','SERVERLESS: peak vCPU','SERVERLESS: peak RAM GB','SERVERLESS: search index'];

const csv = [];
csv.push('AscendOS - Hardware Requirements by Seat Count');
csv.push('Hardware specification only. Three deployment options: Managed platform (Render), Raw VPS (Hetzner), Serverless (Google Cloud Run).');
csv.push(`Usage: Code Compass ${USAGE.low.compass}-${USAGE.high.compass} searches per seat per working day. Code Inspector ${USAGE.low.inspector}-${USAGE.high.inspector} scans per user per working day.`);
csv.push('Hardware columns are sized on the HIGH end of that range. Peak hour sized at 3x the daily average.');
csv.push('Totals include the search index host, which becomes its own machine past a threshold.');
csv.push('');
for (const sc of SCENARIOS) {
  csv.push(sc.title);
  csv.push(sc.sub);
  csv.push(HEAD.join(','));
  for (const r of data[sc.key]) {
    const h = r.hi;
    csv.push([r.seats, r.lo.concurrent.toFixed(2), h.concurrent.toFixed(2),
      h.vcpu.toFixed(2), h.appRam.toFixed(2), h.indexGb.toFixed(2), h.indexDisk,
      `"${h.mgWeb}"`, `"${h.mgIndex}"`, h.mgMachines, h.mgCpu, h.mgRam,
      `"${h.vpWeb}"`, `"${h.vpIndex}"`, h.vpMachines, h.vpCpu, h.vpRam,
      h.svPeak, h.svWarm, h.svCpu, h.svRam, '"managed service"'].join(','));
  }
  csv.push('');
}
const CSV = csv.join('\n');
fs.writeFileSync(path.join(__dirname, 'hardware.csv'), CSV);
module.exports = { SEATS, SCENARIOS, data, CSV, HEAD, USAGE };

console.log(`usage: compass ${USAGE.low.compass}-${USAGE.high.compass}/day, inspector ${USAGE.low.inspector}-${USAGE.high.inspector}/day`);
console.log('rows/scenario:', SEATS.length, '| csv bytes:', CSV.length);
for (const sc of SCENARIOS) {
  const r = data[sc.key][data[sc.key].length - 1];
  console.log(`  ${sc.title.padEnd(46)} @840  conc ${r.lo.concurrent.toFixed(1)}-${r.hi.concurrent.toFixed(1).padEnd(5)} | ` +
    `managed ${String(r.hi.mgMachines).padStart(2)} mach ${String(r.hi.mgCpu).padStart(2)}cpu/${String(r.hi.mgRam).padStart(3)}gb | ` +
    `vps ${String(r.hi.vpMachines).padStart(2)} mach ${String(r.hi.vpCpu).padStart(2)}cpu/${String(r.hi.vpRam).padStart(3)}gb | sv ${r.hi.svPeak} inst`);
}
