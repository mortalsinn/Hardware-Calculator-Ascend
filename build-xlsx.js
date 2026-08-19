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

// Prose rows: merged across the table and given a height that matches the text,
// so the application never has to guess and never guesses a screen-high row.
const LINE_PT = 13.2;
function prose(text, widths, style = S.note) {
  const chars = widths.reduce((a, b) => a + b, 0) * 1.02;
  const lines = Math.max(1, Math.ceil(String(text).length / chars));
  return { cells: [[text, style]], mergeAcross: widths.length,
           height: +(lines * LINE_PT + 3).toFixed(1) };
}
const spacer = h => ({ cells: [], height: h || 6 });

const splitAt = (k,b) => { const a=data[k];
  for (let i=1;i<a.length;i++) if (a[i-1][b].azVmColocated && !a[i][b].azVmColocated) return a[i].seats+' seats';
  return a[0][b].azVmColocated ? 'never in range' : 'from the start'; };

const RW = [112];
const readme = { name:'Read Me', cols:RW, rows:[
  spacer(4),
  [T('AscendOS — Hardware Requirements on Microsoft Azure')],
  prose('Prepared for ShiftIT. Hardware specification only: machine counts, CPU cores, memory and disk. No pricing.', RW),
  spacer(),
  [B('What this is')],
  prose('AscendOS is a browser-delivered platform. Code Compass answers building-code questions against an ingested vector corpus; Code Inspector analyses site photographs. Both are short, bursty jobs that hold a CPU core briefly and release it, and both spend most of their time waiting on a model API rather than computing. The fleet is therefore sized on how many jobs run AT THE SAME INSTANT, not on seat count.', RW),
  spacer(),
  [B('Two column names worth pinning down')],
  prose('"Jobs at once" - the number of searches and photo scans in flight at the SAME INSTANT, at the busiest moment of the busiest day. Not jobs per day, and not people signed in. A search holds a CPU core for a second or two and then releases it, which is why a few thousand searches a day resolve to a handful running simultaneously. This is the figure that determines hardware. It appears as two columns because usage is a range, and every machine figure is sized on the busier of the two.', RW),
  prose('"Machines to buy" - everything ShiftIT would actually provision, added together: the application tier plus the machine holding the search index. On App Service that is N plan instances plus one index VM. On Virtual Machines it is the web servers plus an index server, or one server carrying both at small scale. On Container Apps only the index counts, because the platform starts and stops replicas itself - counting those would imply a standing fleet that does not exist.', RW),
  prose('These are CAPACITY figures, not availability figures. A single instance of anything is a single point of failure; designing for redundancy would at minimum double the application tier and is a separate decision.', RW),
  spacer(),
  [B('The three options — alternatives, not layers')],
  prose('A · App Service (PaaS) — Premium v3 instances. Premium rather than Standard is deliberate: HTTP-driven autoscaling is Premium-only, Standard cannot be made zone-redundant, and Standard caps at 10 instances, a ceiling this range reaches. P0v3 (1 vCPU / 4 GB) is the scaling unit; P1v3 or P2v3 substitute at half or a quarter of the count.', RW),
  prose('B · Virtual Machines — Bsv2 burstable, the right family for spiky low-average load. B2s_v2 and larger bank credits at a 40% base and utilisation here sits well below that. Sized for fewest machines, since operating them is the real cost of this option.', RW),
  prose('C · Container Apps — request-scaled replicas at a fixed 1 vCPU : 2 GiB ratio, max 4 vCPU / 8 GiB each, scaling to zero. Unavoidably a hybrid: the search index cannot live here.', RW),
  spacer(),
  [B('Does Azure change the requirement? No.')],
  prose('Peak concurrency, required cores, required memory and index size are properties of the workload and would be identical on any provider. What Azure changes is the ladder of purchasable units, plus two constraints on the shape of the deployment: the search index can never share a machine on options A or C, and Standard App Service\u2019s instance cap forces Premium for this range.', RW),
  spacer(),
  [B('The search index is the one forced decision')],
  prose('The index is Qdrant, which requires block-level storage with a POSIX filesystem and explicitly does not run on network filesystems. App Service persistent storage is an SMB share and cannot take the exclusive locks a database needs; Container Apps offers only ephemeral storage and Azure Files. Neither can host it. A VM or AKS can, and Azure AI Search is the managed alternative — though that is an API rewrite, not a drop-in. There is no first-party managed Qdrant on Azure; the Marketplace listing is third-party SaaS. See the Search index tab.', RW),
  spacer(),
  [B('Usage assumed')],
  prose(`Code Compass: ${U} searches per seat per working day. Code Inspector: ${I} scans per user per working day, for the subset named in each block.`, RW),
  prose('Peak hour is sized at 3x the flat daily average, because real usage clusters at the start of the day and after lunch rather than spreading evenly.', RW),
  prose(`Usage is a range, so every row is computed twice. All hardware figures follow the HIGH bound (${USAGE.high.compass} searches, ${USAGE.high.inspector} scans) — a fleet sized on average usage is under-provisioned on every busy day. The low bound appears beside it in the concurrency columns.`, RW),
  spacer(),
  [B('Reading the tables')],
  prose('"Required" is what the model computes. The machine columns show the smallest sensible allocation covering it, which is almost always more — that gap is deliberate headroom, not waste.', RW),
  prose('App RAM and index RAM are never summed. Application memory scales with concurrent jobs; the index is a fixed working set that grows with the corpus. On options A and C they are always on different machines.', RW),
  prose(`On Option B the index shares the web VM at small scale and separates later — Compass only at ${splitAt('compass','hi')}, with 250 Inspector users at ${splitAt('insp250','hi')} (high usage). Those rows are shaded, and totals can fall there: one shared box had to satisfy the larger demand in every dimension at once, so two right-sized machines can total less than one oversized one.`, RW),
  spacer(),
  [B('To confirm against your own subscription')],
  prose('Regional vCPU quota is not published by Microsoft and varies by subscription type, age and region; a new subscription may have very low or zero quota in a given region. Quota and capacity are checked separately, so sufficient quota does not guarantee the sizes are available there.', RW),
  prose('Azure AI Search higher quotas are unavailable in Israel Central, Qatar Central, Spain Central and South India, which remain on older limits.', RW),
  prose('Premium v4 is GA with identical vCPU and RAM to v3 — faster processors and NVMe local storage only, so no extra capacity should be budgeted for it. It has no stable outbound IP addresses.', RW),
  spacer(),
  [B('Not included')],
  prose('Pricing. Also excluded: high availability and redundancy, which would at minimum double the web tier; developer and staging environments; CI; off-site backup targets. This is the production serving fleet only.', RW),
  spacer(),
  prose(`Scope: 20 to 840 seats in steps of 20, ${SEATS.length} rows per scenario.`, RW),
]};

function optionSheet(name, title, blurb, header, widths, rowFor, splitKey, machinesNote) {
  const rows = [[T(title)], prose(blurb, widths), spacer(), ...HOW_TO_READ(machinesNote, widths)];
  for (const sc of SCENARIOS) {
    rows.push({ cells: [[sc.title,S.band], ...header.slice(1).map(()=>['',S.band])],
                mergeAcross: header.length, height: 19 });
    rows.push(prose(sc.sub, widths));
    rows.push({ cells: header.map(H), height: 30 });
    let prev = null;
    for (const r of data[sc.key]) {
      const split = splitKey && prev && r.hi[splitKey] !== prev[splitKey];
      rows.push(rowFor(r, split)); prev = r.hi;
    }
    rows.push(spacer(10));
  }
  if (splitKey) rows.push(prose('Shaded rows: the search index moves onto its own machine here.', widths));
  return { name, cols:widths, freeze:{y:7}, rows };
}
const cc = r => [N1(+r.lo.concurrent.toFixed(1)), N1(+r.hi.concurrent.toFixed(1))];

const HW_H = ['Seats','Jobs at once (quiet usage)','Jobs at once (busy usage)',
  'Web tier (size x how many)','Index host (size x how many)','Machines to buy (web + index)',
  'Total vCPU (all machines)','Total RAM GB (all machines)','Index disk GB'];
const HW_W = [8,15,15,20,20,15,14,14,12];

// Repeated at the top of every option sheet: the two column names that are not
// self-explanatory, in plain words, before any numbers appear.
const HOW_TO_READ = (verb, W) => ([
  [B('How to read this sheet')],
  prose('"Jobs at once" - searches and photo scans in flight at the SAME INSTANT, at the busiest moment of the busiest day. Not jobs per day, and not people signed in. A job holds a CPU core for only a second or two, so this is what determines the hardware. Two columns because usage is a range; everything to the right is sized on the busy figure.', W),
  prose(verb, W),
  spacer(),
]);

const appService = optionSheet('A - App Service',
  'Option A — Azure App Service (Premium v3)',
  'Premium rather than Standard is deliberate: HTTP-driven autoscaling is Premium-only, Standard cannot be made zone-redundant, and Standard caps at 10 instances. P0v3 is 1 vCPU / 4 GB; P1v3 (2/8) or P2v3 (4/16) substitute at half or a quarter of the count. The index is always a separate VM — App Service has no durable, lockable block storage. Instance counts stay well inside the 30-instance Premium limit throughout.',
  HW_H, HW_W,
  r => { const h=r.hi; return [[r.seats,S.left],...cc(r),[h.azAppWeb,S.left],[h.azAppIdx,S.left],
    [h.azAppMachines,S.num],[h.azAppCpu,S.num],[h.azAppRam,S.num],[h.indexDisk,S.num]]; },
  null,
  '"Machines to buy" - App Service plan instances plus the one VM holding the search index. "P0v3 x7" means seven instances of 1 vCPU / 4 GB each; with the index VM that is 8 machines.');

const vms = optionSheet('B - Virtual Machines',
  'Option B — Azure Virtual Machines (Bsv2 burstable)',
  'Burstable is the right family for spiky, low-average load: B2s_v2 and larger bank credits at a 40% base and utilisation here sits well below it. There is no Azure equivalent of AWS "Unlimited" mode — an exhausted bank throttles to base and cannot be bought past. Sized for fewest machines, since operating them is the real cost of this option. This is the only option where the index can share the web machine, because it is the only one with block storage.',
  HW_H, HW_W,
  (r,split) => { const h=r.hi, st=split?S.splitNum:S.num, lt=split?S.split:S.left;
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
  r => { const h=r.hi; return [[r.seats,S.left],...cc(r),[h.azCaPeak,S.num],[h.azCaWarm,S.num],
    [1,S.num],[2,S.num],[h.azCaIdx,S.left],[h.azCaMachines - h.azCaPeak,S.num]]; },
  null,
  '"Machines to buy" - the index host ONLY. Replicas are not machines you provision: Container Apps starts and stops them as traffic moves, and bills by request. The peak replica column says how many run at the busiest moment, not what you order.');

const IXW = [8,13,13,20,18,11,16];
const indexSheet = { name:'Search index', freeze:{y:10}, cols:IXW, rows:[
  [T('The search index — the one forced decision')],
  prose('Code Compass answers against a vector index of the ingested building codes. It is currently Qdrant, self-hosted.', IXW),
  [],
  [B('Qdrant requires block-level storage with a POSIX filesystem, and explicitly does not run on network filesystems.')],
  prose('App Service — persistent /home is an SMB share, which cannot take the exclusive file locks a database needs; local disk does not survive a restart. Cannot host it.', IXW),
  prose('Container Apps — ephemeral storage and Azure Files (SMB/NFS) only. No block storage. Ephemeral volumes are destroyed on every scale-in and revision change. Cannot host it.', IXW),
  prose('Virtual Machines or AKS — managed disks are block storage. Either works. Note VM disk IOPS are capped by BOTH disk size and VM size; a larger disk does nothing if the VM tier is the bottleneck.', IXW),
  prose('There is no first-party managed Qdrant on Azure. The Marketplace listing is Qdrant Cloud, operated by Qdrant Solutions GmbH on their own infrastructure. The Container Apps add-on that offered it in preview has been retired.', IXW),
  [],
  { cells: ['Seats','Index RAM GB','Index disk GB','Route 1: self-hosted VM','Route 2: AI Search tier','Partitions','Vector quota needed GB'].map(H), height: 30 },
  ...data.insp250.map(r => { const h=r.hi;
    return [[r.seats,S.left],N1(+h.indexGb.toFixed(1)),[h.indexDisk,S.num],
      [h.azCaIdx,S.left],[h.azSearchTier,S.left],[h.azSearchPart,S.num],N1(h.azSearchGb)]; }),
  [],
  [B('Route 1 — keep Qdrant on a VM or AKS')],
  prose('No application change. A single burstable VM with a Premium SSD data disk covers this entire range. The index must fit in memory, which is what the Index RAM column sizes.', IXW),
  [B('Route 2 — Azure AI Search')],
  prose('Fully managed, native vector and hybrid search, no machine to operate. The governing limit is vector index quota per partition — a memory limit on the graph, not the larger storage quota. Sizing allows for graph overhead and deleted-document slack on top of the raw vectors, which is why the quota needed exceeds the index RAM figure. THIS IS AN API REWRITE, not a drop-in replacement for the Qdrant client: the cost is engineering time, not hardware.', IXW),
  prose('The table always shows the smallest tier that fits on a single partition. Sharding a smaller tier across partitions reaches the same quota but is a more fragile deployment for no measurable benefit. Higher quotas are unavailable in Israel Central, Qatar Central, Spain Central and South India.', IXW),
]};

const OUT = 'AscendOS-Hardware-Requirements.xlsx';
const size = write(OUT, [readme, appService, vms, containerApps, indexSheet]);
console.log(`${OUT}  ${(size/1024).toFixed(1)}KB  |  5 tabs  |  ${SEATS.length} rows x ${SCENARIOS.length} scenarios per option tab`);
