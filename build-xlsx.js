// ========================================================
// build-xlsx.js — the workbook sent to ShiftIT.
//
// One tab per hosting option, because a supplier quotes ONE of them.
// Everything on a single wide sheet made them read across columns they
// were never going to buy.
// ========================================================
const { SEATS, SCENARIOS, data, USAGE } = require('./build-hardware.js');
const { write, S } = require('./xlsx.js');

const KEY_SEATS = [100, 200, 400, 600, 840];
const at = (k, n) => data[k][SEATS.indexOf(n)];
const U = `${USAGE.low.compass}-${USAGE.high.compass}`;
const I = `${USAGE.low.inspector}-${USAGE.high.inspector}`;

const B = (t) => [t, S.bold];
const H = (t) => [t, S.head];
const HL = (t) => [t, S.headL];
const N1 = (v) => [v, S.num1];
const T = (t) => [t, S.title];
const NOTE = (t) => [t, S.note];

// ------------------------------------------------ 1. Read Me
const readme = { name: 'Read Me', cols: [3, 108], freeze: null, rows: [
  [], ['', T('AscendOS — Hardware Requirements')],
  ['', NOTE('Prepared for ShiftIT. Hardware specification only: machine counts, CPU cores, memory and disk. No pricing.')],
  [],
  ['', B('What this is')],
  ['', NOTE('AscendOS is a browser-delivered platform. Code Compass answers building-code questions against an ingested corpus; Code Inspector analyses site photographs. Both are short, bursty jobs that hold a CPU core briefly and then release it, so the fleet is sized on how many run AT THE SAME INSTANT, not on seat count.')],
  [],
  ['', B('The three options')],
  ['', NOTE('Each has its own tab. They are alternatives, not layers — you would supply one of them.')],
  ['', NOTE('A · Managed platform — a PaaS such as Render. Fixed instance sizes; deploys, scaling and failover are handled by the platform. Most instances, because each is small. Fewest moving parts for us to operate.')],
  ['', NOTE('B · Raw VPS — plain virtual servers such as Hetzner. Far more CPU and RAM per machine, so the fleet stays small. Patching, monitoring, backups and failover become an operational responsibility.')],
  ['', NOTE('C · Serverless — request-scaled containers such as Cloud Run, each 1 vCPU / 2 GB, existing only while requests are in flight. Not directly comparable to A and B: there is no standing fleet, so a low instance count does not mean less capacity.')],
  [],
  ['', B('Usage assumed')],
  ['', NOTE(`Code Compass: ${U} searches per seat per working day.`)],
  ['', NOTE(`Code Inspector: ${I} scans per user per working day, for the subset of users named in each block.`)],
  ['', NOTE('Peak hour is sized at 3x the flat daily average, because real usage clusters at the start of the day and after lunch rather than spreading evenly.')],
  [],
  ['', B('Sized on the high end')],
  ['', NOTE(`Usage is a range, so every row is computed twice. All hardware figures follow the HIGH bound (${USAGE.high.compass} searches, ${USAGE.high.inspector} scans) — a fleet sized on average usage is under-provisioned on every busy day. The low bound is shown beside it in the concurrency columns so the sensitivity is visible.`)],
  [],
  ['', B('The one threshold worth planning around')],
  ['', NOTE('Below roughly 12 concurrent jobs the application and its search index share a machine. Above it they separate, and the index needs its own host. Everything else in this workbook is a smooth curve; that is the single step change.')],
  ['', NOTE(`Compass only: splits at ${splitAt('compass','lo')} seats at low usage, ${splitAt('compass','hi')} at high. With 200 Inspector users: ${splitAt('insp200','lo')} / ${splitAt('insp200','hi')}. With 250: ${splitAt('insp250','lo')} / ${splitAt('insp250','hi')}.`)],
  [],
  ['', B('Reading the tables')],
  ['', NOTE('"Required" is what the model computes. The machine columns show the smallest sensible allocation covering it, which is almost always more — that gap is deliberate headroom, not waste.')],
  ['', NOTE('App RAM and index RAM are never summed. Application memory scales with concurrent jobs; the index is a fixed working set that grows with the code corpus. Past the threshold above they live on different machines.')],
  ['', NOTE('Where total cores or memory fall as seats rise, that is the index splitting off: one shared box had to satisfy the larger demand in every dimension at once, so two right-sized machines can total less than one oversized one. Those rows are shaded.')],
  [],
  ['', NOTE(`Scope: 20 to 840 seats in steps of 20, ${SEATS.length} rows per scenario. Generated from the same model as the interactive planner.`)],
]};

function splitAt(k, b) {
  const a = data[k];
  for (let i = 1; i < a.length; i++) if (a[i-1][b].mgColocated && !a[i][b].mgColocated) return a[i].seats;
  return a[0][b].mgColocated ? 'never' : 'from the start';
}

// ------------------------------------------------ 2. Summary
const summary = { name: 'Summary', freeze: { y: 4 },
  cols: [8, 34, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11],
  rows: [
    [T('Summary — what to quote at key seat counts')],
    [NOTE(`Hardware sized on high usage: Compass ${USAGE.high.compass} searches/seat/day, Inspector ${USAGE.high.inspector} scans/user/day. Full 20-seat detail on the option tabs.`)],
    [],
    [H('Seats'), HL('Usage scenario'), H('Peak concurrent'),
     H('A: Machines'), H('A: vCPU'), H('A: RAM GB'),
     H('B: Machines'), H('B: vCPU'), H('B: RAM GB'),
     H('C: Peak inst'), H('C: vCPU'), H('C: RAM GB')],
    ...KEY_SEATS.flatMap(n => SCENARIOS.map(sc => {
      const h = at(sc.key, n).hi;
      return [[n, S.left], [sc.title, S.left], N1(+h.concurrent.toFixed(1)),
        [h.mgMachines, S.num1], [h.mgCpu, S.num1], [h.mgRam, S.num1],
        [h.vpMachines, S.num1], [h.vpCpu, S.num1], [h.vpRam, S.num1],
        [h.svPeak, S.num1], [h.svCpu, S.num1], [h.svRam, S.num1]];
    })),
    [],
    [B('Note'), NOTE('Option C is request-scaled: instances exist only while requests are in flight, so its counts are not comparable to A and B.')],
  ]};

// ------------------------------------------------ 3-5. one tab per option
function optionSheet(name, title, blurb, header, widths, rowFor) {
  const rows = [
    [T(title)], [NOTE(blurb)], [],
  ];
  for (const sc of SCENARIOS) {
    rows.push([[sc.title, S.band], ...header.slice(1).map(() => ['', S.band])]);
    rows.push([[sc.sub, S.note]]);
    rows.push(header.map(H));
    let prev = null;
    for (const r of data[sc.key]) {
      const split = prev && r.hi.mgColocated !== prev.mgColocated;
      rows.push(rowFor(r, split));
      prev = r.hi;
    }
    rows.push([]);
  }
  rows.push([B('Shaded rows'), NOTE('the search index moves onto its own machine here')]);
  return { name, cols: widths, freeze: { y: 3 }, rows };
}

const concCells = (r) => [N1(+r.lo.concurrent.toFixed(1)), N1(+r.hi.concurrent.toFixed(1))];

const managed = optionSheet('A - Managed platform',
  'Option A — Managed platform (PaaS)',
  'Fixed instance sizes; the platform handles deploys, scaling and failover. Sizes shown are Render plan names; equivalent tiers from another provider are fine.',
  ['Seats','Peak conc. low','Peak conc. high','Web tier','Index host','Machines','Total vCPU','Total RAM GB','Index disk GB'],
  [8,13,13,20,20,11,11,13,13],
  (r, split) => { const h = r.hi, st = split ? S.split : S.num1;
    return [[r.seats, split?S.split:S.left], ...concCells(r),
      [h.mgWeb, split?S.split:S.left], [h.mgIndex, split?S.split:S.left],
      [h.mgMachines, st], [h.mgCpu, st], [h.mgRam, st], [h.indexDisk, st]]; });

const vps = optionSheet('B - Raw VPS',
  'Option B — Raw VPS',
  'Plain virtual servers. More CPU and RAM per machine, so the fleet stays small. Sizes shown are Hetzner plan names; equivalent specs from another provider are fine — the vCPU and RAM totals are what matter.',
  ['Seats','Peak conc. low','Peak conc. high','Web tier','Index host','Machines','Total vCPU','Total RAM GB','Index disk GB'],
  [8,13,13,20,20,11,11,13,13],
  (r, split) => { const h = r.hi, st = split ? S.split : S.num1;
    return [[r.seats, split?S.split:S.left], ...concCells(r),
      [h.vpWeb, split?S.split:S.left], [h.vpIndex, split?S.split:S.left],
      [h.vpMachines, st], [h.vpCpu, st], [h.vpRam, st], [h.indexDisk, st]]; });

const serverless = optionSheet('C - Serverless',
  'Option C — Serverless (request-scaled containers)',
  'Each instance is 1 vCPU / 2 GB and exists only while requests are in flight. Peak instances is the concurrent ceiling, not a standing fleet. Warm instances are those kept alive to avoid a 2-5 second cold start. The search index cannot run serverless and remains a managed service.',
  ['Seats','Peak conc. low','Peak conc. high','Peak instances','Warm instances','Peak vCPU','Peak RAM GB','Search index'],
  [8,13,13,15,15,11,13,26],
  (r) => { const h = r.hi;
    return [[r.seats, S.left], ...concCells(r),
      [h.svPeak, S.num1], [h.svWarm, S.num1], [h.svCpu, S.num1], [h.svRam, S.num1],
      ['managed service', S.left]]; });

const OUT = 'AscendOS-Hardware-Requirements.xlsx';
const size = write(OUT, [readme, summary, managed, vps, serverless]);
console.log(`${OUT}  ${(size/1024).toFixed(1)}KB  |  5 tabs  |  ${SEATS.length} rows x ${SCENARIOS.length} scenarios per option tab`);
