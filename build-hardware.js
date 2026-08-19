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
const HEAD = ['Seats',
  'Jobs running at once - quiet usage','Jobs running at once - busy usage',
  'vCPU required (high)','App RAM required GB (high)','Search index RAM GB','Search index disk GB',
  'A App Service: web tier (size x how many)','A App Service: plan tier','A App Service: index host (size x how many)','A: machines to buy (web + index)','A: total vCPU','A: total RAM GB',
  'B VMs: web tier (size x how many)','B VMs: index host (size x how many)','B: machines to buy (web + index)','B: total vCPU','B: total RAM GB',
  'C Container Apps: peak replicas (platform-managed)','C: warm replicas','C: vCPU per replica','C: RAM GB per replica','C: index host (size x how many)','C: machines to buy (index only)',
  'Azure AI Search tier (alternative to self-hosting)','AI Search partitions','AI Search vector quota needed GB'];

const csv = [];
csv.push('AscendOS - Hardware Requirements by Seat Count');
csv.push('"Jobs running at once" = searches and scans in flight at the SAME INSTANT during the busiest hour. Not jobs per day, not users signed in. Shown as a range because usage is a range; all hardware is sized on the busy figure.');
csv.push('"Machines to buy" = things ShiftIT provisions, summed: application tier + search index host. On Container Apps the replicas are NOT counted - the platform starts and stops those itself, so only the index is a standing machine.');
csv.push('Hardware specification only, on Microsoft Azure. Three deployment options: A App Service (PaaS), B Virtual Machines, C Container Apps.');
csv.push(`Usage: Code Compass ${USAGE.low.compass}-${USAGE.high.compass} searches per seat per working day. Code Inspector ${USAGE.low.inspector}-${USAGE.high.inspector} scans per user per working day.`);
csv.push('Hardware columns are sized on the HIGH end of that range. Peak hour sized at 3x the daily average.');
csv.push('Totals include the search index host. On App Service and Container Apps the index is ALWAYS a separate machine: neither offers the durable block storage a vector database needs.');
csv.push('AI Search columns are an alternative to self-hosting the index, not an addition to it.');
csv.push('');
for (const sc of SCENARIOS) {
  csv.push(sc.title);
  csv.push(sc.sub);
  csv.push(HEAD.join(','));
  for (const r of data[sc.key]) {
    const h = r.hi;
    csv.push([r.seats, r.lo.concurrent.toFixed(2), h.concurrent.toFixed(2),
      h.vcpu.toFixed(2), h.appRam.toFixed(2), h.indexGb.toFixed(2), h.indexDisk,
      `"${h.azAppWeb}"`, `"${h.azAppTier}"`, `"${h.azAppIdx}"`, h.azAppMachines, h.azAppCpu, h.azAppRam,
      `"${h.azVmWeb}"`, `"${h.azVmIdx}"`, h.azVmMachines, h.azVmCpu, h.azVmRam,
      h.azCaPeak, h.azCaWarm, 1, 2, `"${h.azCaIdx}"`, h.azCaMachines - h.azCaPeak,
      `"${h.azSearchTier}"`, h.azSearchPart, h.azSearchGb].join(','));
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
    `A ${r.hi.azAppWeb.padEnd(9)} ${String(r.hi.azAppMachines).padStart(2)}m ${String(r.hi.azAppCpu).padStart(2)}c/${String(r.hi.azAppRam).padStart(3)}g | ` +
    `B ${r.hi.azVmWeb.padEnd(11)} ${String(r.hi.azVmMachines).padStart(2)}m | C ${r.hi.azCaPeak} repl | AI Search ${r.hi.azSearchTier}`);
}
