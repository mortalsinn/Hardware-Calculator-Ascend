// ========================================================
// build-xlsx.js — the requirements spec sent to ShiftIT.
//
// This says what the SOFTWARE needs at a given load. It does not say what
// machines to buy: the topology is the hosting provider's decision, and an
// earlier draft that mapped everything onto specific SKUs was answering a
// question nobody asked.
//
// Four sheets: what this is, requirements by load stage, the same at every
// 20 seats, and the constraints the platform has to satisfy whatever shape
// it ends up being.
// ========================================================
const { SEATS, SCENARIOS, data, USAGE, CORPUS, CORPUS_GROWTH, ASSUMPTIONS, futureImpact } = require('./build-hardware.js');
const { write, S } = require('./xlsx.js');

const at = (k, n) => data[k][SEATS.indexOf(n)];
const H840 = at('insp250', 840);
const STAGES = [20, 100, 200, 300, 400, 500, 600, 700, 840];
const U = `${USAGE.low.compass}-${USAGE.high.compass}`;
const I = `${USAGE.low.inspector}-${USAGE.high.inspector}`;

const B = t => [t, S.bold], H = t => [t, S.head], HL = t => [t, S.headL];
const T = t => [t, S.title], N1 = v => [v, S.num1], NUM = v => [v, S.num];

const LINE_PT = 13.2;
function prose(text, widths, style = S.note) {
  const chars = widths.reduce((a, b) => a + b, 0) * 1.02;
  const lines = Math.max(1, Math.ceil(String(text).length / chars));
  return { cells: [[text, style]], mergeAcross: widths.length,
           height: +(lines * LINE_PT + 3).toFixed(1) };
}
const spacer = h => ({ cells: [], height: h || 6 });
const band = (text, n) => ({ cells: [[text, S.band], ...Array(n - 1).fill(['', S.band])],
                             mergeAcross: n, height: 19 });

// ---------------------------------------------------------------- columns
// Read left to right and the last figure stops being mysterious: jobs a day,
// how many land in the busiest hour, how many are running at the same moment.
const CHAIN_H = (unit) => ['Seats', unit + '\nper day', 'in the\nbusiest hour',
  'RUNNING AT THE\nSAME TIME', 'vCPU\nneeded', 'RAM GB\nneeded'];
const CHAIN_W = [10, 14, 15, 17, 12, 12];
const IX_W = [10, 15, 15];

const chainRow = (key, n) => {
  const r = data[key][SEATS.indexOf(n)];
  return [[n, S.left], [r.jobsPerDay, S.thousands], [r.jobsPerBusyHour, S.thousands],
          [+r.hi.concurrent.toFixed(1), S.splitNum],
          N1(+r.hi.vcpu.toFixed(1)), N1(+r.hi.appRam.toFixed(1))];
};
const CORPUS_W = [13, 15, 14, 17, 13, 12, 18];
const corpusRow = (g) => [[g.editions, S.left], [g.books, S.num], N1(g.codeGb), N1(g.tenantGb840),
  [g.totalGb840, g.editions === CORPUS.editionsToday ? S.splitNum : S.num1],
  [g.diskGb840, S.num], [g.yearsFromNow === 0 ? 'today' : 'in about ' + g.yearsFromNow + ' years', S.left]];

const chainBlock = (title, key, unit, seatList) => ([
  band(title, CHAIN_H(unit).length),
  { cells: CHAIN_H(unit).map(H), height: 30 },
  ...seatList.map(n => chainRow(key, n)),
  spacer(10),
]);

// ---------------------------------------------------------------- 1. Read Me
const RW = [112];
const readme = { name: 'Read Me', cols: RW, rows: [
  spacer(4),
  [T('AscendOS — Software Hardware Requirements')],
  prose('Prepared for ShiftIT. What the software needs in order to run, at a range of load levels. It does not specify machines, instance types or topology — that is your call, and these figures are what it has to add up to.', RW),
  spacer(),
  [B('What the software is')],
  prose('AscendOS is browser-delivered. Code Compass answers building-code questions against an ingested vector index; Code Inspector analyses site photographs for code compliance. Both are short jobs that hold a CPU core for seconds and then release it, and most of that time is spent waiting on an external model API rather than computing.', RW),
  prose('SCOPE: Code Compass, and Code Compass plus Code Inspector. The estimating and tender modules exist in the product but are still in development and are not deployed to anyone, so they carry no load and appear nowhere in these figures. That is a deliberate exclusion, not an oversight - see the Assumptions sheet.', RW),
  prose('That behaviour is why the sizing is driven by HOW MANY JOBS RUN AT THE SAME MOMENT rather than by seat count or by requests per day. A few thousand searches spread across a working day resolve to a handful running simultaneously.', RW),
  spacer(),
  [B('The one column worth understanding: "running at the same time"')],
  prose('It is not a fraction of a machine, and it is not how many people are logged in. It is how many searches are being worked on SIMULTANEOUSLY - how many people are sitting watching a spinner at the same instant, during the busiest hour of the day.', RW),
  prose('Take the 840-seat row. Read it left to right and it builds itself:', RW),
  prose(`   840 seats x ${USAGE.high.compass} searches, plus 250 people x ${USAGE.high.inspector} photo scans   =  ${H840.jobsPerDay.toLocaleString('en')} jobs a day`, RW, S.plain),
  prose(`   the busy hour carries 3x its even share of those             =  ${H840.jobsPerBusyHour.toLocaleString('en')} in that hour`, RW, S.plain),
  prose('   each one occupies a core for 12-55 seconds                   =  most finish before the next arrives', RW, S.plain),
  prose(`   so at any given instant, mid-flight                          =  ${H840.hi.concurrent.toFixed(0)} RUNNING AT ONCE`, RW, S.bold),
  prose(`Nearly seven thousand jobs an hour sounds enormous; ${H840.hi.concurrent.toFixed(0)} running simultaneously does not. Both are the same fact. A job takes seconds and then the core is free again, so they overlap far less than the daily total suggests. That overlap is the entire hardware question, and it is why 840 seats need about ${H840.hi.vcpu.toFixed(0)} vCPU rather than hundreds.`, RW),
  prose(`A number below 1 is normal too. At 20 seats with Code Compass alone it is ${data.compass[0].hi.concurrent.toFixed(1)} - meaning a search is in progress about half the busy hour and nothing is running the rest of it.`, RW),
  prose('It is an average, not a ceiling: arrivals are random, so short moments with two or three times the figure still happen, and the platform needs headroom to absorb them.', RW),
  prose('Job lengths differ by module: a Compass search runs about 12 seconds, an Inspector photo scan about 55. That is why a few hundred Inspector users move the figure more than several hundred extra Compass seats do.', RW),
  spacer(),
  [B('The two cases')],
  prose('CODE COMPASS ONLY - every seat running searches. CODE COMPASS + CODE INSPECTOR - the same, plus 250 people also running photo scans, the most demanding configuration currently in scope. Any real deployment sits between the two, so they bracket the answer rather than predicting it.', RW),
  prose(`Both are stated at the BUSY end of expected usage: ${USAGE.high.compass} Code Compass searches per seat per working day, plus ${USAGE.high.inspector} Code Inspector scans per user. A platform sized on average usage is short on every busy day, so there is no point publishing the average. If usage settles at the quiet end (${USAGE.low.compass} and ${USAGE.low.inspector}), every figure here is about a quarter lower.`, RW),
  prose('The busiest hour is taken at 3x the flat daily average, because usage clusters at the start of the day and after lunch rather than spreading evenly.', RW),
  spacer(),
  [B('What the figures cover, and what they do not')],
  prose('The vCPU and RAM columns are the APPLICATION TIER only. The search index is listed separately because it is a fixed working set that grows with the size of the code corpus rather than with load, and because it has storage requirements the application tier does not — see the Platform requirements sheet. The two are never summed.', RW),
  prose('These are CAPACITY figures, not availability figures. Redundancy, failover and zone spread are a separate conversation and would change the shape of any deployment built from them.', RW),
  prose('Not included: developer and staging environments, CI, backup targets, and pricing of any kind.', RW),
  spacer(),
  prose(`Load stages sheet: nine reference points. Full detail sheet: every 20 seats from 20 to 840, ${SEATS.length} rows.`, RW),
]};

// ---------------------------------------------------------------- 2. Load stages
const stages = { name: 'Requirements by load', cols: CHAIN_W, freeze: { y: 7 }, rows: [
  [T('What the software needs, by load stage')],
  prose('Read each table left to right: how many jobs a day, how many of those land in the busiest hour, and how many are therefore running at the same moment. That last figure is what the hardware has to cope with, and the two columns after it are the answer.', CHAIN_W),
  prose('Figures are what the software requires. How that is packaged into machines is your decision.', CHAIN_W),
  prose('"Running at the same time" is an average across the busy hour. A value below 1 is normal and means the work is intermittent - it is not a fraction of a machine. Full explanation on the Read Me sheet.', CHAIN_W),
  prose('vCPU and RAM cover the APPLICATION TIER only. The search index is sized separately below and is never added to them.', CHAIN_W),
  spacer(),
  ...chainBlock('CODE COMPASS ONLY  -  every seat running searches', 'compass', 'searches', STAGES),
  ...chainBlock('CODE COMPASS + CODE INSPECTOR  -  the same, plus 250 people also running scans', 'insp250', 'jobs', STAGES),
  band('SEARCH INDEX  -  driven by TIME, not by load', 7),
  prose('The index holds the ingested building codes: one book per jurisdiction, per edition. Canada has a national code plus 10 provinces and 3 territories - 14 jurisdictions - and a new National Building Code lands roughly every 4 years. Older editions are kept deliberately, because comparing across editions is a feature rather than an archive. So this figure rises on a calendar, not on a seat count, and it never falls.', CORPUS_W),
  { cells: ['Code editions\nkept','Code books\n14 per edition','Building code\nGB','Customer data\nGB at 840 seats','INDEX RAM\nGB','Index disk\nGB','When'].map(H), height: 30 },
  ...CORPUS_GROWTH.map(corpusRow),
  prose('The customer-data column is separate: each customer organisation contributes about 5,000 vectors of their own shop knowledge and visual standards, and at 840 seats that is roughly 105 organisations. It is the smaller of the two, and unlike the code corpus it does track seats.', CORPUS_W),
  spacer(10),
  prose('Between these nine points the requirement rises smoothly - there is no threshold or step change anywhere in this range. The Full detail sheet gives every 20 seats if a specific figure is needed.', CHAIN_W),
]};

// ---------------------------------------------------------------- 3. Full detail
const detail = { name: 'Full detail', cols: CHAIN_W, freeze: { y: 4 }, rows: [
  [T('Every 20 seats, 20 to 840')],
  prose('The same figures as the Load stages sheet, at every increment. Columns are identical.', CHAIN_W),
  spacer(),
  ...chainBlock('CODE COMPASS ONLY', 'compass', 'searches', SEATS),
  ...chainBlock('CODE COMPASS + CODE INSPECTOR, 250 users', 'insp250', 'jobs', SEATS),
]};

// ------------------------------------------------------- 4. Assumptions
// Every input on one page. Two of these were wrong for several drafts
// precisely because they lived only inside the code where nobody could
// challenge them.
const AW = [34, 46, 40];
const assumptions = { name: 'Assumptions', cols: AW, freeze: { y: 4 }, rows: [
  [T('Assumptions')],
  prose('Every input these figures depend on, and where each one came from. If any of it is wrong the numbers move.', AW),
  spacer(),
  { cells: ['Input', 'Value', 'Source'].map(H), height: 20 },
  ...ASSUMPTIONS.map(([k, v, src]) => [[k, S.left], [v, S.left], [src, S.left]]),
  spacer(),
  [B('Modules not in scope')],
  prose('The estimating and tender modules are in development and deployed to nobody, so they carry no load. Their job durations appear above only so the effect of releasing them can be judged without rebuilding this document.', AW),
  { cells: ['If it ships','At this rate','Adds at 840 seats'].map(H), height: 20 },
  ...futureImpact(840).map(f => [[f.module, S.left], [`${f.rate} ${f.unit}`, S.left],
    [`+${f.conc} running at once, +${f.vcpu} vCPU, +${f.ram} GB`, S.left]]),
  prose('Neither would change the storage or network requirements - only the application tier grows.', AW),
  spacer(),
  [B('Derived, not assumed')],
  prose('The vCPU and memory figures come from the two coefficients at the bottom of the table applied to the concurrency figure, which itself comes from the usage rates and job durations above it. Nothing in the requirement columns is a judgement laid on top - change an input and the whole chain moves with it.', AW),
]};

// ---------------------------------------------------------------- 5. Constraints
const CW = [112];
const constraints = { name: 'Platform requirements', cols: CW, rows: [
  spacer(4),
  [T('What the platform has to provide')],
  prose('Independent of topology. These hold whatever the deployment is built from.', CW),
  spacer(),
  [B('COMPUTE')],
  prose('The application tier is stateless and scales horizontally — instances hold no data between requests and need no knowledge of each other. Adding capacity means adding instances.', CW),
  prose('No GPU is required. No specific CPU architecture is required; x64 and Arm are both acceptable. The workload is bursty and spends most of its time waiting on external APIs, so burstable or credit-based instance families suit it well, provided sustained utilisation stays inside whatever baseline they allow.', CW),
  prose('The vCPU and RAM figures are for the application tier only, and are sized on the busy end of the usage range.', CW),
  spacer(),
  [B('STORAGE — the one hard constraint')],
  prose('The search index is Qdrant, a vector database. It requires BLOCK-LEVEL STORAGE WITH A POSIX-COMPATIBLE FILESYSTEM. Qdrant memory-maps its segment files, so this is not a preference.', CW),
  prose('It will NOT run on a network filesystem — NFS, SMB or CIFS — nor on object storage. Network block protocols such as iSCSI are acceptable. SSD is strongly preferred.', CW),
  prose('The index must also fit in memory: see the Search index RAM column, which is the working set, not the disk footprint. Disk should be roughly 1.3x that, and both grow with the size of the ingested code corpus rather than with user load.', CW),
  prose('ON AZURE SPECIFICALLY: App Service cannot satisfy this — its persistent storage is an SMB share and its local disk does not survive a restart. Container Apps cannot either; it offers ephemeral storage and Azure Files only. A Virtual Machine or AKS with a managed disk can. Azure AI Search is a managed alternative but is an API rewrite on our side, not a drop-in, so please treat it as a separate discussion rather than an equivalent option.', CW),
  prose('The application tier itself needs NO persistent storage. Ephemeral disk is fine, and instances do not need a shared filesystem between them.', CW),
  spacer(),
  [B('NETWORK')],
  prose('Outbound HTTPS to external model APIs (Google Gemini and fal.ai) is required from every application instance. There are no inbound requirements beyond ordinary HTTPS.', CW),
  prose('EVERY IN-FLIGHT JOB HOLDS ONE LONG-LIVED STREAMING HTTP RESPONSE, so the number of concurrent streaming connections equals the "jobs at once" figure. Two things follow: any load balancer, proxy or gateway in front of the application must allow idle connections of AT LEAST 120 SECONDS — an Inspector scan streams for around 55 and a timeout below that cuts the job off mid-answer — and response buffering must be disabled, or results arrive in one lump at the end instead of streaming.', CW),
  prose('Where a platform limits outbound connections per instance, note that every job makes several outbound API calls; connection pooling is in place, but a low per-instance cap on outbound ports is worth flagging to us early. On Azure App Service this is the 128-SNAT-port limit, which has no metric and therefore cannot be autoscaled on.', CW),
  prose('Egress volume is modest — JSON responses and rendered images.', CW),
  spacer(),
  [B('WHAT IS NOT REQUIRED')],
  prose('No GPU. No shared filesystem between application instances. No session affinity beyond the lifetime of a single request. No inbound VPN or private link. No specific database engine — the application uses managed Firestore, which is external to anything hosted here.', CW),
  spacer(),
  [B('AVAILABILITY')],
  prose('Everything in this document is CAPACITY. Redundancy and failover are a separate decision: a single instance of anything is a single point of failure, and designing for high availability would change these numbers.', CW),
]};

const OUT = 'AscendOS-Hardware-Requirements.xlsx';
const size = write(OUT, [readme, stages, detail, assumptions, constraints]);
console.log(`${OUT}  ${(size/1024).toFixed(1)}KB  |  5 sheets  |  ${STAGES.length} load stages, ${SEATS.length} detail rows`);
