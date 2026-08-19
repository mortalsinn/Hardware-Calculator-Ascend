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
const AZ = require('./azure.js');

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

  // Azure. The REQUIREMENT above is vendor-neutral -- concurrency, cores,
  // memory and disk are properties of the workload. Only the ladder of
  // purchasable units changes, plus two Azure-specific shape constraints
  // documented in azure.js.
  const aApp = AZ.fitAppService(d);
  const aVm  = AZ.fitVms(d);
  const aCa  = AZ.fitContainerApps(d, 1);

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

    // --- Azure -------------------------------------------------------
    // A: App Service. The index is ALWAYS a separate machine here -- App
    // Service has no durable, lockable block storage to put a database on.
    azAppWeb: `${aApp.web.sku.n} x${aApp.web.count}`,
    azAppTier: aApp.web.sku.tier,
    azAppIdx: `${aApp.idx.sku.n} x${aApp.idx.count}`,
    azAppMachines: aApp.machines, azAppCpu: aApp.cpu, azAppRam: aApp.ram,

    // B: Virtual machines. Block storage exists, so the index may share the
    // web box at small scale exactly as on any other VPS.
    azVmColocated: aVm.colocated,
    azVmWeb: `${aVm.web.sku.n} x${aVm.web.count}`,
    azVmIdx: aVm.idx ? `${aVm.idx.sku.n} x${aVm.idx.count}` : 'on web server',
    azVmMachines: aVm.machines, azVmCpu: aVm.cpu, azVmRam: aVm.ram,

    // C: Container Apps. Cannot host the index at all, so this option is
    // unavoidably a hybrid: replicas plus a separate index host.
    azCaPeak: aCa.peak, azCaWarm: aCa.warm, azCaCpu: aCa.cpu, azCaRam: aCa.ram,
    azCaIdx: `${aCa.idx.sku.n} x${aCa.idx.count}`,
    azCaMachines: aCa.machines,
    azSearchTier: aCa.search.tier, azSearchPart: aCa.search.partitions,
    azSearchGb: +aCa.search.needGb.toFixed(2),
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
// Requirements only. What the software needs; not what to buy.
const HEAD = ['Seats (reference)',
  'Compass only: jobs at once (quiet usage)','Compass only: jobs at once (busy usage)',
  'Compass only: vCPU required','Compass only: RAM GB required',
  'All modules: jobs at once (quiet usage)','All modules: jobs at once (busy usage)',
  'All modules: vCPU required','All modules: RAM GB required',
  'Search index: RAM GB','Search index: disk GB'];

const csv = [];
csv.push('AscendOS - Software Hardware Requirements');
csv.push('What the software needs in order to run, at a range of load levels. It does not specify machines, instance types or topology.');
csv.push('"Jobs at once" = searches and scans running at the SAME MOMENT, averaged over the busiest hour. Not jobs per day, not users signed in. A value below 1 is normal and means the work is intermittent; it is not a fraction of a machine.');
csv.push(`Usage assumed: Code Compass ${USAGE.low.compass}-${USAGE.high.compass} searches per seat per working day; Code Inspector ${USAGE.low.inspector}-${USAGE.high.inspector} scans per user per working day. Busiest hour taken at 3x the flat daily average.`);
csv.push('vCPU and RAM are sized on the BUSY end of each usage range, and cover the APPLICATION TIER ONLY. The search index is listed separately and is never added to them.');
csv.push('"Compass only" = every seat running Code Compass alone (light case). "All modules" = the same plus 250 users also running Code Inspector (heavy case). A real deployment sits between them.');
csv.push('The search index requires block-level storage with a POSIX filesystem and must fit in RAM. It will not run on NFS, SMB or object storage. See the Platform requirements sheet of the workbook.');
csv.push('These are capacity figures, not availability figures.');
csv.push('');
csv.push(HEAD.join(','));
for (let i = 0; i < SEATS.length; i++) {
  const c = data.compass[i], f = data.insp250[i];
  csv.push([SEATS[i],
    c.lo.concurrent.toFixed(2), c.hi.concurrent.toFixed(2), c.hi.vcpu.toFixed(2), c.hi.appRam.toFixed(2),
    f.lo.concurrent.toFixed(2), f.hi.concurrent.toFixed(2), f.hi.vcpu.toFixed(2), f.hi.appRam.toFixed(2),
    f.hi.indexGb.toFixed(2), f.hi.indexDisk].join(','));
}
const CSV = csv.join('\n');
fs.writeFileSync(path.join(__dirname, 'hardware.csv'), CSV);
module.exports = { SEATS, SCENARIOS, data, CSV, HEAD, USAGE };

console.log(`usage: compass ${USAGE.low.compass}-${USAGE.high.compass}/day, inspector ${USAGE.low.inspector}-${USAGE.high.inspector}/day`);
console.log('rows/scenario:', SEATS.length, '| csv bytes:', CSV.length);
for (const sc of SCENARIOS) {
  const r = data[sc.key][data[sc.key].length - 1];
  console.log(`  ${sc.title.padEnd(46)} @840  conc ${r.lo.concurrent.toFixed(1)}-${r.hi.concurrent.toFixed(1).padEnd(5)} | ` +
    `A ${r.hi.azAppWeb.padEnd(9)} ${String(r.hi.azAppMachines).padStart(2)}m ${String(r.hi.azAppCpu).padStart(2)}c/${String(r.hi.azAppRam).padStart(3)}g | ` +
    `B ${r.hi.azVmWeb.padEnd(11)} ${String(r.hi.azVmMachines).padStart(2)}m | C ${r.hi.azCaPeak} repl | AI Search ${r.hi.azSearchTier}`);
}
