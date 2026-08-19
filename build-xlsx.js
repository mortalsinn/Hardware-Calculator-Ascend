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
const { SEATS, SCENARIOS, data, USAGE } = require('./build-hardware.js');
const { write, S } = require('./xlsx.js');

const at = (k, n) => data[k][SEATS.indexOf(n)];
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
// A two-row header: the group on top, the measure beneath. Stacking
// "Compass only / vCPU" into one cell needed three lines and clipped.
const REQ_GROUP = ['', 'Compass only — light case', '', '',
                   'All modules — heavy case', '', '', 'Search index', ''];
const REQ_H = ['Seats\n(reference)',
  'Jobs at once', 'vCPU', 'RAM GB',
  'Jobs at once', 'vCPU', 'RAM GB',
  'RAM GB', 'Disk GB'];
const REQ_W = [11, 15, 10, 10, 15, 10, 10, 12, 12];
// Group cells span their measures. Row number is supplied per sheet.
const groupMerges = (r) => [`B${r}:D${r}`, `E${r}:G${r}`, `H${r}:I${r}`];
const groupRow = () => ({ cells: REQ_GROUP.map(t => [t, t ? S.band : S.plain]), height: 18 });

const reqRow = (n, style = S.num) => {
  const c = at('compass', n), f = at('insp250', n);
  return [[n, S.left],
    [`${c.lo.concurrent.toFixed(1)} – ${c.hi.concurrent.toFixed(1)}`, S.left],
    N1(+c.hi.vcpu.toFixed(1)), N1(+c.hi.appRam.toFixed(1)),
    [`${f.lo.concurrent.toFixed(1)} – ${f.hi.concurrent.toFixed(1)}`, S.left],
    N1(+f.hi.vcpu.toFixed(1)), N1(+f.hi.appRam.toFixed(1)),
    N1(+f.hi.indexGb.toFixed(1)), [f.hi.indexDisk, style]];
};

// ---------------------------------------------------------------- 1. Read Me
const RW = [112];
const readme = { name: 'Read Me', cols: RW, rows: [
  spacer(4),
  [T('AscendOS — Software Hardware Requirements')],
  prose('Prepared for ShiftIT. What the software needs in order to run, at a range of load levels. It does not specify machines, instance types or topology — that is your call, and these figures are what it has to add up to.', RW),
  spacer(),
  [B('What the software is')],
  prose('AscendOS is browser-delivered. Code Compass answers building-code questions against an ingested vector index; Code Inspector analyses site photographs; the estimating modules price work. Every one of them is a short job that holds a CPU core for seconds and then releases it, and most of that time is spent waiting on an external model API rather than computing.', RW),
  prose('That behaviour is why the sizing is driven by HOW MANY JOBS RUN AT THE SAME MOMENT rather than by seat count or by requests per day. A few thousand searches spread across a working day resolve to a handful running simultaneously.', RW),
  spacer(),
  [B('"Jobs at once" — what the number means')],
  prose('The count of searches and scans running at the same moment, averaged across the busiest hour of the day. A value below 1 is normal and means the work is intermittent. Worked through at 20 seats:', RW),
  prose('   20 seats x 20 searches a day                        =  400 searches a day', RW, S.plain),
  prose('   spread across an 8-hour working day                 =   50 an hour', RW, S.plain),
  prose('   the busy hour runs at 3x the daily average          =  150 an hour', RW, S.plain),
  prose('   each search occupies a core for about 12 seconds    =  150 x 12s = 1,800 core-seconds', RW, S.plain),
  prose('   1,800 seconds of work inside a 3,600-second hour    =  0.5 JOBS AT ONCE', RW, S.bold),
  prose('It is not a fraction of a machine. It describes how heavily the application tier is worked, and it only begins to drive the requirement once it passes 1. It is also an average rather than a ceiling: arrivals are random, so 0.5 still produces brief moments with two or three jobs at once, and the platform should have the headroom to absorb them.', RW),
  prose('Job lengths differ by module: a Compass search runs about 12 seconds, an Inspector photo scan about 55. That is why a few hundred Inspector users move the figure more than several hundred extra Compass seats do.', RW),
  spacer(),
  [B('The two columns of scenarios')],
  prose('"Compass only" is every seat running Code Compass and nothing else — the light case. "All modules" adds 250 users running Code Inspector as well, which is the heaviest realistic configuration. Any actual deployment sits between the two.', RW),
  prose(`Each is shown as a range, because usage is a range: Code Compass ${U} searches per seat per working day, Code Inspector ${I} scans per user per working day. The vCPU and RAM figures beside each range are sized on the BUSY end of it — a platform sized on average usage is short on every busy day.`, RW),
  prose('The busiest hour is taken at 3x the flat daily average, because real usage clusters at the start of the day and after lunch rather than spreading evenly.', RW),
  spacer(),
  [B('What the figures cover, and what they do not')],
  prose('The vCPU and RAM columns are the APPLICATION TIER only. The search index is listed separately because it is a fixed working set that grows with the size of the code corpus rather than with load, and because it has storage requirements the application tier does not — see the Platform requirements sheet. The two are never summed.', RW),
  prose('These are CAPACITY figures, not availability figures. Redundancy, failover and zone spread are a separate conversation and would change the shape of any deployment built from them.', RW),
  prose('Not included: developer and staging environments, CI, backup targets, and pricing of any kind.', RW),
  spacer(),
  prose(`Load stages sheet: nine reference points. Full detail sheet: every 20 seats from 20 to 840, ${SEATS.length} rows.`, RW),
]};

// ---------------------------------------------------------------- 2. Load stages
const STAGE_GROUP_ROW = 8;
const stages = { name: 'Requirements by load', cols: REQ_W, freeze: { y: 9 },
  merges: groupMerges(STAGE_GROUP_ROW), rows: [
  [T('What the software needs, by load stage')],
  prose('Application tier vCPU and RAM, plus the search index sized separately. Figures are what the software requires; how that is packaged into machines is your decision.', REQ_W),
  spacer(),
  prose('"Jobs at once" = searches and scans running at the same moment, averaged over the busiest hour. Shown low-to-high because assumed usage is a range. A value below 1 is normal and means the work is intermittent — it is not a fraction of a machine. Full explanation on the Read Me sheet.', REQ_W),
  prose('"Compass only" is the light case: every seat running Code Compass alone. "All modules" is the heavy case: the same, plus 250 users also running Code Inspector. A real deployment sits between them.', REQ_W),
  prose('vCPU and RAM cover the APPLICATION TIER only and are sized on the busy end of each range. The search index is separate and is never added to them.', REQ_W),
  spacer(),
  groupRow(),
  { cells: REQ_H.map(H), height: 28 },
  ...STAGES.map(n => reqRow(n)),
  spacer(10),
  prose('Between these points the requirement rises smoothly — there is no threshold or step change anywhere in this range. The Full detail sheet gives every 20 seats if a specific figure is needed.', REQ_W),
]};

// ---------------------------------------------------------------- 3. Full detail
const DETAIL_GROUP_ROW = 4;
const detail = { name: 'Full detail', cols: REQ_W, freeze: { y: 5 },
  merges: groupMerges(DETAIL_GROUP_ROW), rows: [
  [T('Every 20 seats, 20 to 840')],
  prose('The same figures as the Load stages sheet, at every increment. Columns are identical.', REQ_W),
  spacer(),
  groupRow(),
  { cells: REQ_H.map(H), height: 28 },
  ...SEATS.map(n => reqRow(n)),
]};

// ---------------------------------------------------------------- 4. Constraints
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
const size = write(OUT, [readme, stages, detail, constraints]);
console.log(`${OUT}  ${(size/1024).toFixed(1)}KB  |  4 sheets  |  ${STAGES.length} load stages, ${SEATS.length} detail rows`);
