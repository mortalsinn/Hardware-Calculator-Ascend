# AscendOS — Hardware & Cost Calculator

An interactive capacity planner for AscendOS, from **1 seat to 1,000,000**. Drag the
inputs and it sizes Render.com instances, Qdrant memory, Firestore ops, bandwidth and
the Gemini bill, and names the architecture change each tier forces.

`index.html` is the whole thing — no build step, no dependencies, no network calls.
Deploy as a **Render Static Site** with the repo root as the publish directory.

---

## The two findings worth knowing

**1. Hardware is not your scaling problem.** The backend spends its life *waiting* on
external AI calls, so compute follows concurrency rather than headcount. One 1-core /
2 GB instance genuinely carries ~10 seats — that is not a projection, it is what both
AscendOS and McLean's run on today, and the model's idle floor is calibrated to it.
A hundred seats needs two instances.

**The architecture collapses as well as grows.** Below the point where the app and its
index stop fitting together, they are not separated — one box runs both, which is what
Ironwood actually does. Splitting Qdrant onto its own service is a decision the numbers
should *force*, not a shape assumed from the start. At one seat with no usage the answer
is a single $25 instance, not a production split.

**2. Cost per seat hits a floor and never improves — and the floor is AI, not iron.** It falls steeply from one seat to
about a hundred — that early number is mostly the minimum viable server — and then
flattens permanently. Servers amortise across customers; tokens do not, because every
new seat brings its own scans. Growth alone will never make a seat cheaper. Only fewer
or cheaper tokens per scan will.

Within the AI bill, **Inspector is the cost centre twice over**: it is the only workload
routed to Pro, and the only one paying per-element segmentation. It is also the input the
whole model is most sensitive to — moving Inspector from 3/day to 15/day takes cost per
seat from roughly $12 to roughly $55. If you change one number, change that one.

---

## What is modelled

| Area | How it is sized |
|---|---|
| Render web service | Peak concurrent scans via Little's Law, fitted to the cheapest viable plan combination |
| Qdrant | Vector count × (768 dims × 4 bytes + payload) × 1.4 index overhead, as a Private Service + disk |
| Firestore | Operations per job and per seat. Not a scaling limit — it scales itself; the bill and the 1 MB document ceiling are what move |
| Gemini | Flash for everything, Pro for the Inspector vision call only. Input and output priced separately, because output runs 5–6× input |
| Segmentation | Billed per element outlined — a busy photograph costs more than a quiet one |
| Bandwidth | Render workspace allowance plus overage |

Instance sizing avoids two traps that a naive fit falls into: it prefers **scaling out
where that is cheaper** (Render's ladder is not linear in price per core), and it applies
a **2 GB per-instance floor** because image processing and PDF rendering need headroom —
a box too small to hold one unit of work is not a cheaper answer, it is a broken one.

---

## Sources

- Instance specifications — [Render compute plans](https://render.com/docs/compute-plans)
- Instance pricing, bandwidth overage, workspace tiers — Render pricing, as published August 2026
- Gemini Flash and Pro token rates — vendor pricing, August 2026

**Prices are inputs, not constants.** Rates are editable in the UI on purpose: model
pricing moves, and a hardcoded number would go stale quietly and mislead. Set your real
blended rates before trusting any dollar figure.

---

## What to challenge first

Every assumption is listed at the bottom of the page. The softest by a wide margin are
the **per-scan token counts**, which are estimated from the call graph rather than
measured. Log real usage per scan and replace them — every dollar figure moves with them.

Nothing here is a measurement of a running system at scale. It is a model, and it is only
as good as the inputs you give it.
