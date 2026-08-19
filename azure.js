// ========================================================
// azure.js — mapping the computed requirement onto Azure SKUs.
//
// The REQUIREMENT does not change with vendor. Concurrency, cores, memory
// and disk are properties of the workload. What changes is the ladder of
// purchasable units, and Azure's ladder has two constraints that alter the
// SHAPE of the deployment rather than just its labels:
//
//   1. App Service cannot host the vector index. Its persistent /home is an
//      SMB share, which cannot take the exclusive file locks a database
//      needs, and its local disk does not survive a restart. Qdrant requires
//      block-level storage with a POSIX filesystem and explicitly does not
//      work on network filesystems. So on Option A the index NEVER shares a
//      machine with the app -- the colocated small-scale shape that Render
//      allows simply does not exist here.
//
//   2. Standard tier caps at 10 instances. Past that the plan must be
//      Premium v3/v4, which is also the only tier with HTTP-driven
//      autoscaling. That is a tier change forced by scale, not by features.
//
// Sources: learn.microsoft.com App Service SKU + scale limits, Bsv2-series,
// Container Apps storage-mounts, Azure AI Search service limits, and
// Qdrant's own installation requirements. Verified August 2026.
// ========================================================

// Linux App Service plans. Basic is omitted deliberately: max 3 instances
// and manual scaling only, which rules it out for a production fleet.
const APP_SKUS = [
  { n:'S1',   cpu:1, ram:1.75, tier:'Standard',   max:10 },
  { n:'S2',   cpu:2, ram:3.5,  tier:'Standard',   max:10 },
  { n:'S3',   cpu:4, ram:7,    tier:'Standard',   max:10 },
  { n:'P0v3', cpu:1, ram:4,    tier:'Premium v3', max:30 },
  { n:'P1v3', cpu:2, ram:8,    tier:'Premium v3', max:30 },
  { n:'P2v3', cpu:4, ram:16,   tier:'Premium v3', max:30 },
  { n:'P3v3', cpu:8, ram:32,   tier:'Premium v3', max:30 },
];

// Bsv2 burstable. The right family for this workload: short CPU spikes on a
// low average. Base performance is 40% per vCPU across B2s_v2/B4s_v2/B8s_v2,
// and average utilisation here sits well under that, so credits bank rather
// than drain. Note there is no Azure equivalent of AWS "Unlimited" mode --
// an exhausted bank throttles to base, it cannot be bought past.
const VM_SKUS = [
  { n:'B2ls_v2', cpu:2,  ram:4   },
  { n:'B2s_v2',  cpu:2,  ram:8   },
  { n:'B4s_v2',  cpu:4,  ram:16  },
  { n:'B8s_v2',  cpu:8,  ram:32  },
  { n:'B16s_v2', cpu:16, ram:64  },
  { n:'B32s_v2', cpu:32, ram:128 },
];

// Azure AI Search, for services created after 17 May 2024. The figure that
// governs this use case is the VECTOR INDEX quota per partition, which is a
// memory limit on the HNSW graph -- not the larger storage quota.
const SEARCH_TIERS = [
  { n:'Basic', vectorGb:5,   maxPartitions:3  },
  { n:'S1',    vectorGb:35,  maxPartitions:12 },
  { n:'S2',    vectorGb:150, maxPartitions:12 },
  { n:'S3',    vectorGb:300, maxPartitions:12 },
];

const MIN_RAM_PER_INSTANCE = 2;   // sharp buffers and PDF rendering

// ONE SKU PER OPTION, SCALED OUT -- not the mathematically minimal mix.
//
// Letting a fitter pick freely from the whole ladder minimises provisioned
// cores, but it makes the SHAPE oscillate as seats rise: P0v3 x1, then P1v3
// x1, then P0v3 x3, then P2v3 x1. Every one of those is defensible in
// isolation and the sequence is nonsense to quote from. Real deployments fix
// an instance size and change the count, so that is what this does.
function scaleOut(sku, needCpu, needRam, minCount = 1) {
  const count = Math.max(minCount, Math.ceil(needCpu / sku.cpu), Math.ceil(needRam / sku.ram));
  return { sku, count, cpu: +(sku.cpu * count).toFixed(2), ram: +(sku.ram * count).toFixed(2),
           capped: sku.max ? count > sku.max : false };
}

// For raw VMs the objective is different: fewest machines, because operating
// them is the whole cost of this option. One big box beats four small ones.
function fitFewestMachines(skus, needCpu, needRam, minCount = 1) {
  let best = null;
  for (const s of skus) {
    const count = Math.max(minCount, Math.ceil(needCpu / s.cpu), Math.ceil(needRam / s.ram));
    const cand = { sku: s, count, cpu: s.cpu * count, ram: s.ram * count };
    const better = !best || cand.count < best.count
      || (cand.count === best.count && cand.cpu < best.cpu)
      || (cand.count === best.count && cand.cpu === best.cpu && cand.ram < best.ram);
    if (better) best = cand;
  }
  return best;
}

// A single machine large enough to hold the index in memory.
function fitIndexHost(qGb) {
  for (const s of VM_SKUS) if (s.ram >= qGb) return { sku: s, count: 1, cpu: s.cpu, ram: s.ram };
  const top = VM_SKUS[VM_SKUS.length - 1];
  const count = Math.ceil(qGb / top.ram);
  return { sku: top, count, cpu: top.cpu * count, ram: top.ram * count, sharded: true };
}

// Vector quota needed = raw x HNSW graph overhead x slack for deleted docs.
// Prefer the smallest tier that fits on a SINGLE partition. Sharding across
// partitions of a smaller tier technically reaches the same quota, but it is
// a more fragile deployment for no benefit we can measure without pricing --
// and the index grows with the corpus, so headroom is worth having.
function fitSearchService(qGb) {
  const need = qGb * 1.15 * 1.10;
  for (const t of SEARCH_TIERS) {
    if (need <= t.vectorGb) return { tier: t.n, partitions: 1, needGb: need };
  }
  for (const t of SEARCH_TIERS) {
    const partitions = Math.ceil(need / t.vectorGb);
    if (partitions <= t.maxPartitions) return { tier: t.n, partitions, needGb: need };
  }
  const t = SEARCH_TIERS[SEARCH_TIERS.length - 1];
  return { tier: t.n, partitions: t.maxPartitions, needGb: need, over: true };
}

// Option A. App Service for the web tier; the index always on its own VM,
// because App Service has nowhere durable and lockable to put it.
// P0v3 is the unit: the smallest Premium v3 instance, 1 vCPU / 4 GB. Premium
// throughout is deliberate -- Standard looks cheaper in cores but has
// rule-based autoscaling only (HTTP-driven scaling is Premium-only), cannot be
// made zone-redundant, and caps at 10 instances, which this range reaches.
// Scaling out in 1-core steps also wastes the least. P1v3 (2/8) or P2v3 (4/16)
// substitute directly at half or a quarter of the count.
const APP_UNIT = APP_SKUS.find(s => s.n === 'P0v3');

function fitAppService(d) {
  const web = scaleOut(APP_UNIT, d.needCpu, d.needRam, d.webN);
  const idx = fitIndexHost(d.qGb);
  return { web, idx, colocated: false,
    machines: web.count + idx.count,
    cpu: +(web.cpu + idx.cpu).toFixed(2),
    ram: +(web.ram + idx.ram).toFixed(2),
    tier: web.sku.tier, capped: web.capped };
}

// Option B. Plain VMs, where block storage exists, so the index may share
// the web box at small scale exactly as it does on any other VPS.
function fitVms(d) {
  const colocated = (d.needRam + d.qGb) <= 28 && d.peakConc < 12 && d.webN === 1;
  const web = fitFewestMachines(VM_SKUS, d.needCpu, d.needRam + (colocated ? d.qGb : 0), d.webN);
  const idx = colocated ? null : fitIndexHost(d.qGb);
  return { web, idx, colocated,
    machines: web.count + (idx ? idx.count : 0),
    cpu: web.cpu + (idx ? idx.cpu : 0),
    ram: web.ram + (idx ? idx.ram : 0) };
}

// Option C. Container Apps replicas are fixed at a 1 vCPU : 2 GiB ratio and
// cap at 4 vCPU / 8 GiB. The index cannot live here at all: Container Apps
// offers only ephemeral storage and Azure Files (SMB/NFS), and Qdrant does
// not run on a network filesystem. So this option is unavoidably a hybrid.
const REPLICA = { cpu: 1, ram: 2 };
const CONC_PER_REPLICA = 45;

function fitContainerApps(d, warmReplicas) {
  const peak = Math.max(1, Math.ceil(d.peakConc / CONC_PER_REPLICA));
  const replicas = Math.max(peak, warmReplicas || 0);
  const idx = fitIndexHost(d.qGb);
  const search = fitSearchService(d.qGb);
  return { peak: replicas, warm: warmReplicas || 0,
    cpu: replicas * REPLICA.cpu, ram: replicas * REPLICA.ram,
    idx, search, machines: replicas + idx.count };
}

module.exports = { APP_UNIT, APP_SKUS, VM_SKUS, SEARCH_TIERS, REPLICA, CONC_PER_REPLICA,
  MIN_RAM_PER_INSTANCE, fitAppService, fitVms, fitContainerApps, fitIndexHost, fitSearchService };
