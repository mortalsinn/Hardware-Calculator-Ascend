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

// EVERY module the platform runs, with the rate for each. An earlier draft
// carried Compass and Inspector only and still called the result "all
// modules"; Estimating was set to zero despite a stated rate, which
// understated the load at 840 seats by roughly a third.
const USAGE = {
  low:  { compass: 15, inspector: 5, estimating: 3 },
  high: { compass: 20, inspector: 7, estimating: 5 },
};

// Tender scans are the heaviest job on the platform at ~95 seconds and 13 API
// calls each, and no rate has been established for them. They are EXCLUDED
// rather than guessed, and that exclusion is stated in the documents. If
// tenders are run regularly these figures need revisiting: at one per seat per
// week, 840 seats would add roughly 5 to the concurrent figure.
const TENDER_RATE = 0;

// The vector index is NOT driven by user load, and only marginally by customer
// count. It is driven by how much building code has been ingested: one book per
// jurisdiction per edition. Canada has one national code plus 10 provinces and
// 3 territories, and a new National Building Code lands every four to five
// years with older editions retained for comparison — so the corpus grows with
// TIME, permanently, whether or not a single seat is added.
const CORPUS = {
  jurisdictions: 14,      // national + 10 provinces + 3 territories
  editionsToday: 2,       // current edition plus the previous one, for comparison
  yearsPerEdition: 4,
  vectorsPerBook: 45000,
  vectorsPerOrg: 5000,    // shop knowledge, visual SOPs, vision training
  bytesPerVector: 768 * 4 + 2200,
  overhead: 1.4,          // HNSW graph and payload indexes
  seatsPerOrg: 8,
};
const indexGbFor = (books, orgs) =>
  (books * CORPUS.vectorsPerBook + orgs * CORPUS.vectorsPerOrg)
  * CORPUS.bytesPerVector * CORPUS.overhead / 1e9;

const posFor = n => Math.log10(Math.max(1, n)) / 6 * 1000;

// A subset of users running Inspector is expressed as an equivalent
// fleet-wide rate: the model is linear in job volume, so 200 users at 7
// scans/day is exactly the same total work — and the same concurrency —
// as the equivalent average spread across all seats.
function shape(seats, inspectorSeats, u) {
  Object.assign(vals, {
    seats: String(posFor(seats)),
    comp: String(u.compass), insp: '0', est: String(u.estimating),
    tend: String(TENDER_RATE),
    peak: '30', warm: '1', fx: '1.17',
    // `reg` is the count of ingested CODE BOOKS, not geographic regions. It was
    // set to 1, which modelled a single book and left the index 92% customer
    // data — the reverse of reality.
    reg: String(CORPUS.jurisdictions * CORPUS.editionsToday),
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

// The chain a reader can follow: jobs a day -> jobs in the busy hour -> jobs
// running at the same moment. Showing only the last number made it look like
// an arbitrary figure; showing the steps makes it obvious.
const WORK_HOURS = 8, PEAK_MULTIPLE = 3;

const row = (seats, inspectorSeats) => {
  const perDay = seats * USAGE.high.compass
               + seats * USAGE.high.estimating
               + Math.min(inspectorSeats, seats) * USAGE.high.inspector;
  return {
    seats,
    jobsPerDay: Math.round(perDay),
    jobsPerBusyHour: Math.round(perDay / WORK_HOURS * PEAK_MULTIPLE),
    lo: shape(seats, inspectorSeats, USAGE.low),
    hi: shape(seats, inspectorSeats, USAGE.high),
  };
};

const SEATS = [];
for (let n = 20; n <= 840; n += 20) SEATS.push(n);

const SCENARIOS = [
  { key: 'compass', title: 'Code Compass and Estimating',
    sub: `Every seat runs ${USAGE.low.compass}–${USAGE.high.compass} Code Compass searches and ${USAGE.low.estimating}–${USAGE.high.estimating} estimating jobs per working day. No Code Inspector.`, insp: 0 },
  { key: 'insp200', title: 'All modules, 200 Code Inspector users',
    sub: `Every seat runs Compass and Estimating. 200 of them also run Code Inspector ${USAGE.low.inspector}–${USAGE.high.inspector} times per working day.`, insp: 200 },
  { key: 'insp250', title: 'All modules, 250 Code Inspector users',
    sub: `Every seat runs Compass and Estimating. 250 of them also run Code Inspector ${USAGE.low.inspector}–${USAGE.high.inspector} times per working day.`, insp: 250 },
];

const data = {};
for (const sc of SCENARIOS) data[sc.key] = SEATS.map(n => row(n, Math.min(sc.insp, n)));

// ---------------------------------------------------------------- CSV
// Requirements only. What the software needs; not what to buy.
const HEAD = ['Seats',
  'Without Inspector: jobs per day','Without Inspector: jobs in the busiest hour',
  'Without Inspector: running at the same time','Without Inspector: vCPU required','Without Inspector: RAM GB required',
  'All modules: jobs per day','All modules: jobs in the busiest hour',
  'All modules: running at the same time','All modules: vCPU required','All modules: RAM GB required',
  'Search index: RAM GB','Search index: disk GB'];

const csv = [];
csv.push('AscendOS - Software Hardware Requirements');
csv.push('What the software needs in order to run, at a range of load levels. It does not specify machines, instance types or topology.');
csv.push('Read each row left to right: jobs a day, then how many of those land in the busiest hour, then how many are running at the same moment. That last figure is what the hardware has to cope with.');
csv.push('"Running at the same time" is an average across the busy hour. A value below 1 is normal and means the work is intermittent - it is not a fraction of a machine.');
csv.push(`All figures assume the BUSY end of expected usage: ${USAGE.high.compass} Code Compass searches per seat per working day and ${USAGE.high.inspector} Code Inspector scans per user per day. If usage settles at the quiet end (${USAGE.low.compass} and ${USAGE.low.inspector}) every figure is about a quarter lower.`);
csv.push('The busiest hour is taken at 3x the flat daily average, because usage clusters at the start of the day and after lunch rather than spreading evenly.');
csv.push('vCPU and RAM are sized on the BUSY end of each usage range, and cover the APPLICATION TIER ONLY. The search index is listed separately and is never added to them.');
csv.push('"Compass only" = every seat running Code Compass alone (light case). "All modules" = the same plus 250 users also running Code Inspector (heavy case). A real deployment sits between them.');
csv.push('TENDER SCANS ARE EXCLUDED - the heaviest job on the platform at ~95 seconds and 13 model API calls each, with no usage rate established. If tenders run regularly these figures need revisiting.');
csv.push('"Without Code Inspector" = every seat running Code Compass and the estimating modules. "All modules" = the same plus 250 users also running Code Inspector.');
csv.push('The search index requires block-level storage with a POSIX filesystem and must fit in RAM. It will not run on NFS, SMB or object storage. See the Platform requirements sheet of the workbook.');
csv.push('The search index is NOT driven by user load. It holds the ingested building codes - one book per jurisdiction per edition, 14 Canadian jurisdictions, a new National Building Code roughly every 4 years with older editions retained. It grows with TIME and never falls. The figure below is at today\u2019s corpus of ' + (CORPUS.jurisdictions*CORPUS.editionsToday) + ' books; see the Search index section of the workbook for its growth.');
csv.push('These are capacity figures, not availability figures.');
csv.push('');
csv.push(HEAD.join(','));
for (let i = 0; i < SEATS.length; i++) {
  const c = data.compass[i], f = data.insp250[i];
  csv.push([SEATS[i],
    c.jobsPerDay, c.jobsPerBusyHour, c.hi.concurrent.toFixed(1), c.hi.vcpu.toFixed(1), c.hi.appRam.toFixed(1),
    f.jobsPerDay, f.jobsPerBusyHour, f.hi.concurrent.toFixed(1), f.hi.vcpu.toFixed(1), f.hi.appRam.toFixed(1),
    f.hi.indexGb.toFixed(1), f.hi.indexDisk].join(','));
}
const CSV = csv.join('\n');
fs.writeFileSync(path.join(__dirname, 'hardware.csv'), CSV);
// The corpus grows with TIME, not with load. One book per jurisdiction per
// edition, a new edition every four to five years, older editions retained
// because comparison across editions is the point.
const CORPUS_GROWTH = [1, 2, 3, 4, 5, 6].map(editions => {
  const books = CORPUS.jurisdictions * editions;
  return {
    editions, books,
    yearsFromNow: Math.max(0, (editions - CORPUS.editionsToday) * CORPUS.yearsPerEdition),
    codeGb: +indexGbFor(books, 0).toFixed(1),
    tenantGb840: +indexGbFor(0, Math.ceil(840 / CORPUS.seatsPerOrg)).toFixed(1),
    totalGb840: +indexGbFor(books, Math.ceil(840 / CORPUS.seatsPerOrg)).toFixed(1),
    diskGb840: Math.ceil(indexGbFor(books, Math.ceil(840 / CORPUS.seatsPerOrg)) * 1.3),
  };
});

// Every input the figures depend on, with where each one came from. Written
// down because an input that lives only inside the code is an input nobody can
// challenge -- two of these were wrong for several drafts precisely because
// they were never on the page.
const ASSUMPTIONS = [
  ['Code Compass searches', `${USAGE.low.compass}–${USAGE.high.compass} per seat per working day`, 'Stated by Ironwood'],
  ['Estimating jobs', `${USAGE.low.estimating}–${USAGE.high.estimating} per seat per working day`, 'Stated by Ironwood'],
  ['Code Inspector scans', `${USAGE.low.inspector}–${USAGE.high.inspector} per user per working day, for the named subset`, 'Stated by Ironwood'],
  ['Tender scans', 'EXCLUDED — no rate established', 'Heaviest job on the platform. See note below'],
  ['Compass job duration', '12 seconds, 3 model API calls', 'Measured in the platform'],
  ['Estimating job duration', '20 seconds, 3 model API calls', 'Measured in the platform'],
  ['Inspector job duration', '55 seconds, 4 model API calls', 'Measured in the platform'],
  ['Tender job duration', '95 seconds, 13 model API calls', 'Measured in the platform'],
  ['Working day', `${WORK_HOURS} hours`, 'Assumption'],
  ['Busiest hour', `${PEAK_MULTIPLE}× the flat daily average`, 'Assumption — usage clusters morning and after lunch'],
  ['Seats per customer organisation', String(CORPUS.seatsPerOrg), 'Assumption — McLean\u2019s runs 10'],
  ['Jurisdictions in the corpus', `${CORPUS.jurisdictions} — 1 national + 10 provinces + 3 territories`, 'Canadian building code coverage'],
  ['Code editions retained', `${CORPUS.editionsToday} today, +1 every ${CORPUS.yearsPerEdition} years`, 'Older editions kept for comparison'],
  ['Vectors per code book', CORPUS.vectorsPerBook.toLocaleString('en'), 'Measured from an ingested book'],
  ['Vectors per customer org', CORPUS.vectorsPerOrg.toLocaleString('en'), 'Shop knowledge, visual SOPs, vision training'],
  ['Bytes per vector', `${CORPUS.bytesPerVector.toLocaleString('en')} — 768 dimensions float32 plus payload text`, 'Measured'],
  ['Index memory overhead', `${CORPUS.overhead}×`, 'HNSW graph and payload indexes'],
  ['CPU per concurrent job', '0.30 vCPU, plus 0.35 baseline', 'Derived from platform measurements'],
  ['Memory per concurrent job', '0.35 GB, plus 1.20 GB baseline', 'Derived from platform measurements'],
];

module.exports = { SEATS, SCENARIOS, data, CSV, HEAD, USAGE, WORK_HOURS, PEAK_MULTIPLE,
  CORPUS, TENDER_RATE, indexGbFor, CORPUS_GROWTH, ASSUMPTIONS };

console.log(`usage: compass ${USAGE.low.compass}-${USAGE.high.compass}/day, inspector ${USAGE.low.inspector}-${USAGE.high.inspector}/day`);
console.log('rows/scenario:', SEATS.length, '| csv bytes:', CSV.length);
for (const sc of SCENARIOS) {
  const r = data[sc.key][data[sc.key].length - 1];
  console.log(`  ${sc.title.padEnd(46)} @840  conc ${r.lo.concurrent.toFixed(1)}-${r.hi.concurrent.toFixed(1).padEnd(5)} | ` +
    `A ${r.hi.azAppWeb.padEnd(9)} ${String(r.hi.azAppMachines).padStart(2)}m ${String(r.hi.azAppCpu).padStart(2)}c/${String(r.hi.azAppRam).padStart(3)}g | ` +
    `B ${r.hi.azVmWeb.padEnd(11)} ${String(r.hi.azVmMachines).padStart(2)}m | C ${r.hi.azCaPeak} repl | AI Search ${r.hi.azSearchTier}`);
}
