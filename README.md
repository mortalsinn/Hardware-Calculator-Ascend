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
| 10 | $175 | $147 | **$133** | $124 |
| 100 | $1.4k | $1.3k | **$1.3k** | $1.25k |
| 500 | $7.0k | $6.4k | **$6.3k** | $6.2k |
| 10,000 | $134k | $128k | **$125k** | $124k |

*(These figures were revised upward on 2026-08-18: an audit found the Estimating input
was labelled per-day but multiplied as per-week, undercounting that module ~4.9×. The
model is now cross-checked by an independent recompute of jobs/month.)*

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
  free Starter genuinely cover it), scale-to-zero for dev/staging, and from ~10 seats up
  the cheapest *managed* option. One warm instance (~$20/mo at Google's reduced idle
  rate) removes the morning cold start.
- **VPS** — the cheapest iron at every scale and the only tab where egress is free. The
  euros are exact; the price it does not show is that **you become the ops team**:
  patching, monitoring, backups, 3 a.m. restarts. The model prices machines, not people,
  and says so.

---

## Verify it yourself

```
node verify.js
```

Three layers, because the first version only tested one and bugs kept appearing in the
other two:

1. **Formulas** — a clean-room re-implementation of the spec, sharing no code with the
   page, compared component by component at 10 and 10,000 seats across all three
   architectures.
2. **Display** — the real `render()` driven against a capturing DOM across ~900 input
   combinations, asserting that what a human *sees* is sane: no NaN/Infinity, every
   percentage in range, cost-bar widths summing to 100, share claims measured against
   the right denominator.
3. **Behaviour** — properties that must hold everywhere: cost is monotonic in seats,
   totals equal their parts, zero usage means zero AI, the peak multiplier sizes
   hardware but never tokens, nothing negative or non-finite anywhere.

It reads the model out of `index.html` directly, so it always tests what is deployed.

**What verification cannot establish:** whether the assumptions match reality. Tokens
per scan, egress per job and the unpublished Cloud Run idle rate are estimates, flagged
on the page. This proves the model computes what it claims — not that the claims are
the world.

## Accuracy, stated plainly

**Verified (August 2026), from vendor pages:**
- [Render compute plans](https://render.com/docs/compute-plans) and published instance pricing
- [Cloud Run pricing](https://cloud.google.com/run/pricing) — $0.000024/vCPU-s, $0.0000025/GiB-s,
  $0.40/M requests, free tier applied in the math
- [Pinecone pricing](https://www.pinecone.io/pricing/) and [cost docs](https://docs.pinecone.io/guides/manage-cost/understanding-cost) —
  $0.33/GB-mo storage; read units priced at the **top** of the published $16–18/M range;
  free Starter tier (2 GB, 1M RU) applied; $50/mo Standard minimum applied
- Hetzner CX23 (€5.49) and CX43 (€15.99), post-June-2026 increases

**Documented but unpublished:** Google confirms idle min-instances bill at a *reduced*
rate under request-based billing but does not publish the figure; modelled at ~10% of
active CPU (a warm 1 vCPU / 2 GiB instance ≈ $20/mo) and flagged on the page. Verify
against a real bill before presenting.

**Interpolated, and flagged as such:** Hetzner CX33/CX53 (scaled at the confirmed uplift).

**Calibrated against a real machine:** the idle floor reproduces the 1-core / 2 GB
instance that serves ~10 seats in production today.

**Estimated — the numbers to replace with measurements, in order of impact:**
1. Tokens per scan (drives the dominant AI line on every tab)
2. Egress per job (~8 MB; steers the top end past ~100k seats)
3. Requests per job, vector queries per job

Where a published price range exists, the expensive end is used. Nothing here is a bill;
it is a model, and the page lists every assumption it makes.
