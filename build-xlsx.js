// ========================================================
// build-xlsx.js — the workbook sent to ShiftIT, on Azure.
//
// One tab per hosting option, because a supplier quotes ONE of them, plus a
// tab for the search index, which is the only forced decision in the design.
// ========================================================
const { SEATS, SCENARIOS, data, USAGE } = require('./build-hardware.js');
const { write, S } = require('./xlsx.js');

const KEY_SEATS = [100, 200, 400, 600, 840];
const at = (k,n) => data[k][SEATS.indexOf(n)];
const U = `${USAGE.low.compass}-${USAGE.high.compass}`;
const I = `${USAGE.low.inspector}-${USAGE.high.inspector}`;
const B = t => [t,S.bold], H = t => [t,S.head], HL = t => [t,S.headL];
const N1 = v => [v,S.num1], T = t => [t,S.title], NOTE = t => [t,S.note];

const splitAt = (k,b) => { const a=data[k];
  for (let i=1;i<a.length;i++) if (a[i-1][b].azVmColocated && !a[i][b].azVmColocated) return a[i].seats+' seats';
  return a[0][b].azVmColocated ? 'never in range' : 'from the start'; };

const readme = { name:'Read Me', cols:[3,110], rows:[
  [], ['',T('AscendOS — Hardware Requirements on Microsoft Azure')],
  ['',NOTE('Prepared for ShiftIT. Hardware specification only: machine counts, CPU cores, memory and disk. No pricing.')],
  [],
  ['',B('What this is')],
  ['',NOTE('AscendOS is a browser-delivered platform. Code Compass answers building-code questions against an ingested vector corpus; Code Inspector analyses site photographs. Both are short, bursty jobs that hold a CPU core briefly and release it, and both spend most of their time waiting on a model API rather than computing. The fleet is therefore sized on how many jobs run AT THE SAME INSTANT, not on seat count.')],
  [],
  ['',B('The three options — alternatives, not layers')],
  ['',NOTE('A · App Service (PaaS) — Premium v3 instances. Premium rather than Standard is deliberate: HTTP-driven autoscaling is Premium-only, Standard cannot be made zone-redundant, and Standard caps at 10 instances, a ceiling this range reaches. P0v3 (1 vCPU / 4 GB) is the scaling unit; P1v3 or P2v3 substitute at half or a quarter of the count.')],
  ['',NOTE('B · Virtual Machines — Bsv2 burstable, the right family for spiky low-average load. B2s_v2 and larger bank credits at a 40% base and utilisation here sits well below that. Sized for fewest machines, since operating them is the real cost of this option.')],
  ['',NOTE('C · Container Apps — request-scaled replicas at a fixed 1 vCPU : 2 GiB ratio, max 4 vCPU / 8 GiB each, scaling to zero. Unavoidably a hybrid: the search index cannot live here.')],
  [],
  ['',B('Does Azure change the requirement? No.')],
  ['',NOTE('Peak concurrency, required cores, required memory and index size are properties of the workload and would be identical on any provider. What Azure changes is the ladder of purchasable units, plus two constraints on the shape of the deployment: the search index can never share a machine on options A or C, and Standard App Service’s instance cap forces Premium for this range.')],
  [],
  ['',B('The search index is the one forced decision')],
  ['',NOTE('The index is Qdrant, which requires block-level storage with a POSIX filesystem and explicitly does not run on network filesystems. App Service persistent storage is an SMB share and cannot take the exclusive locks a database needs; Container Apps offers only ephemeral storage and Azure Files. Neither can host it. A VM or AKS can, and Azure AI Search is the managed alternative — though that is an API rewrite, not a drop-in. There is no first-party managed Qdrant on Azure; the Marketplace listing is third-party SaaS. See the Search index tab.')],
  [],
  ['',B('Usage assumed')],
  ['',NOTE(`Code Compass: ${U} searches per seat per working day. Code Inspector: ${I} scans per user per working day, for the subset named in each block.`)],
  ['',NOTE('Peak hour is sized at 3x the flat daily average, because real usage clusters at the start of the day and after lunch rather than spreading evenly.')],
  ['',NOTE(`Usage is a range, so every row is computed twice. All hardware figures follow the HIGH bound (${USAGE.high.compass} searches, ${USAGE.high.inspector} scans) — a fleet sized on average usage is under-provisioned on every busy day. The low bound appears beside it in the concurrency columns.`)],
  [],
  ['',B('Two column names worth pinning down')],
  ['',NOTE('"Jobs at once" - the number of searches and photo scans in flight at the SAME INSTANT, at the busiest moment of the busiest day. Not jobs per day, and not people signed in. A search holds a CPU core for a second or two and then releases it, which is why a few thousand searches a day resolve to a handful running simultaneously. This is the figure that determines hardware. It appears as two columns because usage is a range, and every machine figure is sized on the busier of the two.')],
  ['',NOTE('"Machines to buy" - everything ShiftIT would actually provision, added together: the application tier plus the machine holding the search index. On App Service that is N plan instances plus one index VM. On Virtual Machines it is the web servers plus an index server, or one server carrying both at small scale. On Container Apps only the index counts, because the platform starts and stops replicas itself - counting those would imply a standing fleet that does not exist.')],
  ['',NOTE('These are CAPACITY figures, not availability figures. A single instance of anything is a single point of failure; designing for redundancy would at minimum double the application tier and is a separate decision.')],
  [],
  ['',B('Reading the tables')],
  ['',NOTE('"Required" is what the model computes. The machine columns show the smallest sensible allocation covering it, which is almost always more — that gap is deliberate headroom, not waste.')],
  ['',NOTE('App RAM and index RAM are never summed. Application memory scales with concurrent jobs; the index is a fixed working set that grows with the corpus. On options A and C they are always on different machines.')],
  ['',NOTE(`On Option B the index shares the web VM at small scale and separates later — Compass only at ${splitAt('compass','hi')}, with 250 Inspector users at ${splitAt('insp250','hi')} (high usage). Those rows are shaded, and totals can fall there: one shared box had to satisfy the larger demand in every dimension at once, so two right-sized machines can total less than one oversized one.`)],
  [],
  ['',B('To confirm against your own subscription')],
  ['',NOTE('Regional vCPU quota is not published by Microsoft and varies by subscription type, age and region; a new subscription may have very low or zero quota in a given region. Quota and capacity are checked separately, so sufficient quota does not guarantee the sizes are available there.')],
  ['',NOTE('Azure AI Search higher quotas are unavailable in Israel Central, Qatar Central, Spain Central and South India, which remain on older limits.')],
  ['',NOTE('Premium v4 is GA with identical vCPU and RAM to v3 — faster processors and NVMe local storage only, so no extra capacity should be budgeted for it. It has no stable outbound IP addresses.')],
  [],
  ['',B('Not included')],
  ['',NOTE('Pricing. Also excluded: high availability and redundancy, which would at minimum double the web tier; developer and staging environments; CI; off-site backup targets. This is the production serving fleet only.')],
  [],
  ['',NOTE(`Scope: 20 to 840 seats in steps of 20, ${SEATS.length} rows per scenario.`)],
]};

const summary = { name:'Summary', freeze:{y:4}, cols:[8,34,11,14,9,9,9,14,9,9,9,10,14], rows:[
  [T('Summary — what to quote at key seat counts')],
  [NOTE(`Azure. Sized on high usage: Compass ${USAGE.high.compass} searches/seat/day, Inspector ${USAGE.high.inspector} scans/user/day. Totals include the search index host. Full 20-seat detail on the option tabs.`)],
  [],
  [H('Seats'),HL('Usage scenario'),H('Peak concurrent'),
   HL('A: App Service'),H('A: Mach'),H('A: vCPU'),H('A: RAM GB'),
   HL('B: Virtual Machines'),H('B: Mach'),H('B: vCPU'),H('B: RAM GB'),
   H('C: Replicas'),HL('C: Index host')],
  ...KEY_SEATS.flatMap(n => SCENARIOS.map(sc => { const h = at(sc.key,n).hi;
    return [[n,S.left],[sc.title,S.left],N1(+h.concurrent.toFixed(1)),
      [h.azAppWeb,S.left],[h.azAppMachines,S.num1],[h.azAppCpu,S.num1],[h.azAppRam,S.num1],
      [h.azVmWeb,S.left],[h.azVmMachines,S.num1],[h.azVmCpu,S.num1],[h.azVmRam,S.num1],
      [h.azCaPeak,S.num1],[h.azCaIdx,S.left]]; })),
  [],
  [B('Note'),NOTE('On options A and C the search index is always a separate machine — neither App Service nor Container Apps has block storage. Option B is the only one where it can share the web machine, and only at small scale.')],
]};

function optionSheet(name, title, blurb, header, widths, rowFor, splitKey, machinesNote) {
  const rows = [[T(title)],[NOTE(blurb)],[], ...HOW_TO_READ(machinesNote)];
  for (const sc of SCENARIOS) {
    rows.push([[sc.title,S.band], ...header.slice(1).map(()=>['',S.band])]);
    rows.push([[sc.sub,S.note]]);
    rows.push(header.map(H));
    let prev = null;
    for (const r of data[sc.key]) {
      const split = splitKey && prev && r.hi[splitKey] !== prev[splitKey];
      rows.push(rowFor(r, split)); prev = r.hi;
    }
    rows.push([]);
  }
  if (splitKey) rows.push([B('Shaded rows'),NOTE('the search index moves onto its own machine here')]);
  return { name, cols:widths, freeze:{y:7}, rows };
}
const cc = r => [N1(+r.lo.concurrent.toFixed(1)), N1(+r.hi.concurrent.toFixed(1))];

const HW_H = ['Seats','Jobs at once (quiet usage)','Jobs at once (busy usage)',
  'Web tier (size x how many)','Index host (size x how many)','Machines to buy (web + index)',
  'Total vCPU (all machines)','Total RAM GB (all machines)','Index disk GB'];
const HW_W = [8,15,15,20,20,15,14,14,12];

// Repeated at the top of every option sheet: the two column names that are not
// self-explanatory, in plain words, before any numbers appear.
const HOW_TO_READ = (verb) => ([
  [B('How to read this sheet')],
  [NOTE('"Jobs at once" - searches and photo scans in flight at the SAME INSTANT, at the busiest moment of the busiest day. Not jobs per day, and not people signed in. A job holds a CPU core for only a second or two, so this is what determines the hardware. Two columns because usage is a range; everything to the right is sized on the busy figure.')],
  [NOTE(verb)],
  []
]);

const appService = optionSheet('A - App Service',
  'Option A — Azure App Service (Premium v3)',
  'Premium rather than Standard is deliberate: HTTP-driven autoscaling is Premium-only, Standard cannot be made zone-redundant, and Standard caps at 10 instances. P0v3 is 1 vCPU / 4 GB; P1v3 (2/8) or P2v3 (4/16) substitute at half or a quarter of the count. The index is always a separate VM — App Service has no durable, lockable block storage. Instance counts stay well inside the 30-instance Premium limit throughout.',
  HW_H, HW_W,
  r => { const h=r.hi; return [[r.seats,S.left],...cc(r),[h.azAppWeb,S.left],[h.azAppIdx,S.left],
    [h.azAppMachines,S.num1],[h.azAppCpu,S.num1],[h.azAppRam,S.num1],[h.indexDisk,S.num1]]; },
  null,
  '"Machines to buy" - App Service plan instances plus the one VM holding the search index. "P0v3 x7" means seven instances of 1 vCPU / 4 GB each; with the index VM that is 8 machines.');

const vms = optionSheet('B - Virtual Machines',
  'Option B — Azure Virtual Machines (Bsv2 burstable)',
  'Burstable is the right family for spiky, low-average load: B2s_v2 and larger bank credits at a 40% base and utilisation here sits well below it. There is no Azure equivalent of AWS "Unlimited" mode — an exhausted bank throttles to base and cannot be bought past. Sized for fewest machines, since operating them is the real cost of this option. This is the only option where the index can share the web machine, because it is the only one with block storage.',
  HW_H, HW_W,
  (r,split) => { const h=r.hi, st=split?S.split:S.num1, lt=split?S.split:S.left;
    return [[r.seats,lt],...cc(r),[h.azVmWeb,lt],[h.azVmIdx,lt],
      [h.azVmMachines,st],[h.azVmCpu,st],[h.azVmRam,st],[h.indexDisk,st]]; },
  'azVmColocated',
  '"Machines to buy" - web servers plus the index server, or a single server carrying both at small scale. Where the index host reads "on web server" the count is 1, and both workloads share it.');

const containerApps = optionSheet('C - Container Apps',
  'Option C — Azure Container Apps',
  'Replicas exist only while requests are in flight and scale to zero. Allocation is fixed at 1 vCPU : 2 GiB, capped at 4 vCPU / 8 GiB per replica. Replica count follows a configured concurrency threshold, not a platform limit — Container Apps has no per-replica request cap. One replica absorbs this whole range at the assumed 45 concurrent requests per replica; for availability rather than capacity, run at least two. The index cannot live here and needs its own machine at every seat count.',
  ['Seats','Jobs at once (quiet usage)','Jobs at once (busy usage)','Peak replicas (platform-managed)',
   'Warm replicas','vCPU per replica','RAM GB per replica','Index host (size x how many)','Machines to buy (index only)'],
  [8,15,15,18,13,13,14,20,15],
  r => { const h=r.hi; return [[r.seats,S.left],...cc(r),[h.azCaPeak,S.num1],[h.azCaWarm,S.num1],
    [1,S.num1],[2,S.num1],[h.azCaIdx,S.left],[h.azCaMachines - h.azCaPeak,S.num1]]; },
  null,
  '"Machines to buy" - the index host ONLY. Replicas are not machines you provision: Container Apps starts and stops them as traffic moves, and bills by request. The peak replica column says how many run at the busiest moment, not what you order.');

const indexSheet = { name:'Search index', freeze:{y:9}, cols:[8,13,13,20,18,11,16], rows:[
  [T('The search index — the one forced decision')],
  [NOTE('Code Compass answers against a vector index of the ingested building codes. It is currently Qdrant, self-hosted.')],
  [],
  [B('Qdrant requires block-level storage with a POSIX filesystem, and explicitly does not run on network filesystems.')],
  [NOTE('App Service — persistent /home is an SMB share, which cannot take the exclusive file locks a database needs; local disk does not survive a restart. Cannot host it.')],
  [NOTE('Container Apps — ephemeral storage and Azure Files (SMB/NFS) only. No block storage. Ephemeral volumes are destroyed on every scale-in and revision change. Cannot host it.')],
  [NOTE('Virtual Machines or AKS — managed disks are block storage. Either works. Note VM disk IOPS are capped by BOTH disk size and VM size; a larger disk does nothing if the VM tier is the bottleneck.')],
  [NOTE('There is no first-party managed Qdrant on Azure. The Marketplace listing is Qdrant Cloud, operated by Qdrant Solutions GmbH on their own infrastructure. The Container Apps add-on that offered it in preview has been retired.')],
  [],
  ['Seats','Index RAM GB','Index disk GB','Route 1: self-hosted VM','Route 2: AI Search tier','Partitions','Vector quota needed GB'].map(H),
  ...data.insp250.map(r => { const h=r.hi;
    return [[r.seats,S.left],N1(+h.indexGb.toFixed(1)),[h.indexDisk,S.num1],
      [h.azCaIdx,S.left],[h.azSearchTier,S.left],[h.azSearchPart,S.num1],N1(h.azSearchGb)]; }),
  [],
  [B('Route 1 — keep Qdrant on a VM or AKS')],
  [NOTE('No application change. A single burstable VM with a Premium SSD data disk covers this entire range. The index must fit in memory, which is what the Index RAM column sizes.')],
  [B('Route 2 — Azure AI Search')],
  [NOTE('Fully managed, native vector and hybrid search, no machine to operate. The governing limit is vector index quota per partition — a memory limit on the graph, not the larger storage quota. Sizing allows for graph overhead and deleted-document slack on top of the raw vectors, which is why the quota needed exceeds the index RAM figure. THIS IS AN API REWRITE, not a drop-in replacement for the Qdrant client: the cost is engineering time, not hardware.')],
  [NOTE('The table always shows the smallest tier that fits on a single partition. Sharding a smaller tier across partitions reaches the same quota but is a more fragile deployment for no measurable benefit. Higher quotas are unavailable in Israel Central, Qatar Central, Spain Central and South India.')],
]};

const OUT = 'AscendOS-Hardware-Requirements.xlsx';
const size = write(OUT, [readme, summary, appService, vms, containerApps, indexSheet]);
console.log(`${OUT}  ${(size/1024).toFixed(1)}KB  |  6 tabs  |  ${SEATS.length} rows x ${SCENARIOS.length} scenarios per option tab`);
