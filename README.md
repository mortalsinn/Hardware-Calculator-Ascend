# AscendOS — Hardware & Cost Calculator

An interactive planner for AscendOS from **1 seat to 1,000,000**, across the **three
realistic hosting architectures**, side by side. Drag the inputs; every tab recalculates
live, and a comparison strip keeps all three totals visible at once.

`index.html` is the whole thing — no build step, no dependencies, no network calls.
Deploy as a **Render Static Site** with the repo root as the publish directory.

---

## The three options

| | Managed · Render | Serverless · Cloud Run + Pinecone | Raw VPS · Hetzner |
|---|---|---|---|
| **You operate** | almost nothing | almost nothing | everything |
| **Scales to zero** | no ($25 floor) | yes (with cold starts) | no |
| **Vector DB** | self-hosted Qdrant | Pinecone serverless | self-hosted Qdrant |
| **Egress** | workspace + $0.15/GB | ~$0.12/GB | **20 TB/server included** |

### At the calibrated usage (Compass 5/day, Inspector 3/day, Estimating 4/day per seat)

| Seats | Render | Serverless | VPS | AI (identical on all) |
|---|---|---|---|---|
| 10 | $164 | $187 | **$122** | $113 |
| 100 | $1.25k | $1.2k | **$1.1k** | $1.1k |
| 500 | $6.0k | $5.9k | **$5.7k** | $5.6k |
| 10,000 | $121k | $116k | **$114k** | $113k |

Read that last column again — **that is the finding.** The AI bill is identical on every
tab and dominates from ~25 seats onward. Architecture choice moves the infrastructure
slice only, and from 100 seats the three options are within a few percent of each other
all-in. **Hosting is an operations decision, not a cost decision** — until ~100k seats,
where egress pricing splits them apart (and where the per-job egress estimate is the
model's softest number; it says so on the page).

### What each tab is for

- **Render** — what runs today. Zero ops. The $25 floor is the price of never thinking
  about servers.
- **Serverless** — nearly $0 infra below ~100 seats (Cloud Run free tier + Pinecone's
  free Starter genuinely cover it), scale-to-zero for dev/staging environments, and the
  smoothest cost curve. One warm instance ($71/mo) removes cold starts — note that an
  always-warm serverless instance costs ~3× a Render Standard box, so "serverless is
  cheaper" is only true if you accept cold starts or have real traffic.
- **VPS** — the cheapest iron at every scale and the only tab where egress is free. The
  euros are exact; the price it does not show is that **you become the ops team**:
  patching, monitoring, backups, 3 a.m. restarts. The model prices machines, not people,
  and says so.

---

## Accuracy, stated plainly

**Verified (August 2026), from vendor pages:**
- [Render compute plans](https://render.com/docs/compute-plans) and published instance pricing
- [Cloud Run pricing](https://cloud.google.com/run/pricing) — $0.000024/vCPU-s, $0.0000025/GiB-s,
  $0.40/M requests, free tier applied in the math
- [Pinecone pricing](https://www.pinecone.io/pricing/) and [cost docs](https://docs.pinecone.io/guides/manage-cost/understanding-cost) —
  $0.33/GB-mo storage; read units priced at the **top** of the published $16–18/M range;
  free Starter tier (2 GB, 1M RU) applied; $50/mo Standard minimum applied
- Hetzner CX23 (€5.49) and CX43 (€15.99), post-June-2026 increases

**Interpolated, and flagged as such:** Hetzner CX33/CX53 (scaled at the confirmed uplift).

**Calibrated against a real machine:** the idle floor reproduces the 1-core / 2 GB
instance that serves ~10 seats in production today.

**Estimated — the numbers to replace with measurements, in order of impact:**
1. Tokens per scan (drives the dominant AI line on every tab)
2. Egress per job (~8 MB; steers the top end past ~100k seats)
3. Requests per job, vector queries per job

Where a published price range exists, the expensive end is used. Nothing here is a bill;
it is a model, and the page lists every assumption it makes.
