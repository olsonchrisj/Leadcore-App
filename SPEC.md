# Leadcore Trolling Calculator: Spec

## Goal

Tell an angler how much leadcore to let out (as a reel-counter reading) to put a lure at a target depth, and get more accurate the more depth readings they log. Live at https://olsonchrisj.github.io/Leadcore-App/ (installable PWA, works offline).

## The setup this is built around

- **Line:** Sufix 832 Advanced Lead Core (a generic "traditional leadcore" option exists too). 100 yd (300 ft, 10 colors) of leadcore spliced directly to backing.
- **Counter:** reads feet, zeroed when the leadcore reaches the rod tip, so *counter = leadcore out*. Counter above the leadcore length means backing is out.
- **Truth source:** Garmin LiveScope depth readings, logged by hand (counter + depth, with the current rig).
- **Water:** inland lakes (walleye, trout, kokanee). No current, turns, rod angle or holder (dropped by decision). Water temperature was removed as clutter.
- **Rig inputs:** speed, leader material / length / test, lure (type → brand → model), optional attractor (flasher, dodger, fly, other), leadcore on the reel.

## Outputs

- **Plan:** counter to set for a target depth, as feet (or metres) and colors (+ backing), with the depth range you will likely land in (80%).
- **Chart:** depth-versus-line-out plot (model band + your readings) and a table of counter settings for every depth and speed.
- **Readings:** every logged reading compared with what the model says, with outliers flagged.

## How depth is computed

The old approach (a log-linear regression on top of a rule-of-thumb table) could not represent how speed, leader, lure drag and backing interact. It is replaced by a physical model that the readings then calibrate.

### Towed-cable physics (`src/engine/cable.ts`)

The line from lure to boat is a flexible cable of segments (leader, leadcore, backing), each with weight in water `w` (N/m), diameter `d`, normal drag coefficient `cdn` and tangential friction `cft`. Integrating from the lure toward the boat with tension `T`, angle below horizontal `θ` and arc length `u`:

```
dT/du  = w·sinθ + q·cft·π·d·cosθ|cosθ|          q = ½ρU²
dθ/du  = (w·cosθ − q·cdn·d·sinθ|sinθ|) / T
dz/du  = sinθ        (depth gained)
dx/du  = cosθ        (setback)
```

The end body (lure + attractor + hardware) is in equilibrium: `T₀cosθ₀ = drag`, `T₀sinθ₀ = downward force` (weight in water plus the bill's dive force). Far from the end body a long line settles to a terminal slope `sin²θ/cosθ = (K/U)²`, with `K² = w / (½ρ·cdn·d)`, which gives the familiar "feet of depth per color, shallower when you go faster".

Numerics: RK4 on a deterministic geometric step grid (0.02 m growing ×1.25 to 1.5 m, landing on segment boundaries) so the result is a smooth function of every parameter, which the fitter's derivatives rely on.

### Starting values (`src/engine/catalog.ts`)

**These are engineering estimates, not measurements.** Sufix 832 is calibrated so a reference rig (300 ft of leadcore, 2 mph, 50 ft of 12 lb fluorocarbon leader, 0.35 oz spoon) gives about 7.0 ft of depth per 30 ft color (the commonly quoted figure); traditional leadcore about 5.2 (the quoted figures are 5 for traditional and 7 for Sufix 832). Lure and attractor drag areas are order-of-magnitude values per type, scaled by weight, length or rated dive depth; the bill lift of a lipped lure comes from its rated dive (a #5 Shad Rap runs about 8 ft below its leader's end on 50 ft of 10 lb mono, which fixes the scale); leader drag and density come from material and test. Everything is multiplied by a learned factor, so errors here cost accuracy only until the readings outvote them.

### What the physics says (and tests pin down)

- Depth is roughly proportional to 1/speed for a long line (fitted exponent about −1.06).
- Backing keeps sinking at about the leadcore's end angle, so it adds roughly 0.19 ft of depth per foot out (the old model's "+2% per 100 ft" was wrong).
- The leader and lure don't just add a constant: their effect decays slowly along the line, which is why lure weight and leader drag still matter on a deep set.
- With no leadcore out, a 50 ft leader and a small spoon still sit about 8–11 ft down at 2 mph, and a #5 Shad Rap on 50 ft of mono about 8 ft (the model's own estimates; learnable).

## How it learns (`src/engine/fit.ts`, `model.ts`, `priors.ts`)

```
ln(depth_ft) = ln(physical depth with learned multipliers) + discrepancy
```

- **Learned physical multipliers** (log scale): line constant `K` (per line), lure drag (by type, then per lure), bill lift of lipped lures (by type, then per lure: how steeply the line leaves the lure), attractor drag (by type, then per attractor), global lure weight-in-water, global leader drag. A lure with few readings borrows from its type.
- **Discrepancy:** a small linear correction (offset, speed slope, line-out slope, per-rig / per-lure / per-type offsets) that soaks up whatever the physics misses, held tight by its priors.
- **Priors:** Gaussian on every parameter (sd 0.3 on the line constant, 0.35 / 0.3 on lure type / lure drag, 0.5 on downforce, 0.4 on leader drag, 0.05–0.22 on the discrepancy terms), with hard bounds so the model stays physical.
- **Fit:** Levenberg–Marquardt on the posterior mode with a Huber loss (threshold 2σ) so one mistyped depth cannot drag the fit; noise σ starts at 7% and is re-estimated from the residuals once there are ≥ 6 readings; warm-started from the previous fit (parameters and noise level), which the app also caches between sessions.
- **Uncertainty:** Laplace posterior covariance → an 80% predictive band that shrinks where the data are, widens when extrapolating (with explicit warnings for speeds or line out beyond what has been logged, and for lures with no readings).
- **Diagnostics:** per-reading residual, robust weight, leave-one-out error (from leverage), flagged when |z| > 2.5. Readings can be left out of the model without deleting them.
- **Guidance:** `suggestNextReading` proposes the most informative nearby speed and line out; `referenceRate` reports the learned feet per color against the starting estimate.

### Validation (simulation, not field data)

`npm test` runs 87 tests, including: exact limits (catenary with no drag, straight-down hang, level weightless line, terminal slope), step-size convergence, agreement with refined solves across random plausible conditions, monotonicity, finite-difference checks of every gradient, recovery of known parameters from simulated readings, honest 80% bands (about 80% of fresh readings land inside), uncertainty shrinking with data, outlier robustness, leave-one-out versus brute-force refits, and a fit of a season of readings staying fast.

Simulation results (`src/engine/test-utils.ts` generates the readings):

| Readings logged | Median error on unseen rigs (in-family world) | 90th percentile |
|---|---|---|
| 0 (catalogue only) | 6.8% | 12.3% |
| 6 | 2.6% | 7.3% |
| 12 | 2.5% | 7.0% |
| 24 | 1.1% | 3.3% |
| 48 | 1.0% | 2.7% |

That world is one where the true line sinks 20% harder than the catalogue, spoons are draggier, crankbill lift is weaker and the leader behaves differently, but the physics is the model's own. In a deliberately mis-specified world (depth following a different speed law and fixed offsets that the cable physics cannot reproduce exactly) the median error was 4.9% at 8 readings, 3.6% at 16, 3.1% at 32 and 2.6% at 64 (90th percentile 16% → 8%), and the 80% band held 71–82% of new noisy readings. With no readings in that world the catalogue was off by about 37%, which is what an unverified starting catalogue can do when the real gear differs a lot.

**None of this is field validation**: it shows the machinery is sound, not that the starting catalogue matches real Sufix 832 and real lures. Expect the first few readings per lure to matter a lot.

Performance: a cold fit of 48 readings takes about 0.1 s on a desktop and 100 readings about 0.2 s; later fits start from the previous answer (cached between sessions) and take about half that or less. Logging a reading with 41 already stored took about 0.4 s end to end on a CPU throttled 4× slower; a plan takes under 10 ms.

## Data

- Stored in the browser's `localStorage` (keys `lc.readings`, `lc.lures`, `lc.atts`, `lc.rig`, `lc.settings`), on the device only. The app asks the browser to protect it from automatic cleanup.
- Everything read from storage or a backup goes through `src/state/validate.ts`: valid records are kept, harmlessly missing fields repaired, anything dropped is counted and a copy kept under `lc.<key>.rescued.<time>` (3 most recent). Ids are restricted to URL-safe characters; links from files must be `https://`.
- **Backup file** (JSON, `app: "leadcore-calculator"`, `version: 2`): readings, custom lures, custom attractors. Version 1 files still restore. Restore validates the whole file first, then merges by id and never overwrites existing records. The app nudges for a backup when readings are unsaved.
- Lure specs for old readings come from the catalogue as it is now, so a corrected weight improves earlier readings too.
- Internally everything is feet and mph; metric and knots/km/h are display conversions.

## Screens

Plan · Chart · Readings · Lures · Settings (bottom navigation). Dark and light themes (follows the phone by default), 44 px touch targets, steppers for depth and speed, comma decimals accepted, toasts with undo for saves and deletes, an error boundary that offers to save your data if anything crashes. `axe-core` finds no WCAG 2.1 A/AA or best-practice violations on any screen in either theme.

## Lure catalogue (`src/data/lures.ts`)

About 130 trolled lures (spoons, crankbaits, stickbaits, plugs, divers, spinners/harnesses, soft baits; full Acme spoon range, Kalin's soft plastics, Walleye Nation Creations) plus attractors. Weights and lengths appear only where retailer or manufacturer listings agreed, each with a source link (manufacturer preferred). Rated dive depths are for casting or mono trolling and do **not** apply on leadcore: they are used only as a proxy for bill size in the drag prior. Custom lures take weight, length and rated dive.

## Not modelled

Current, wind drift, turns, rod angle and holder, water temperature / thermocline, line stretch, counter calibration error (indistinguishable from the dive curve), a backing other than thin braid (0.2 mm assumed), other leadcore brands beyond the two lines, downriggers and divers' own physics (divers are treated as a lure type with a big drag).

## Development

```
npm install
npm run dev                # dev server
npm test                   # 82 unit tests
npm run build              # typecheck + production build in dist/
npx vite preview --port 4173 &
node tools/e2e/smoke.mjs   # end-to-end flows in headless Chromium (needs Playwright)
```

- `src/engine/`: cable solver, catalogue, model, priors, fit, predictions (pure TS, SI inside, ft/mph at the edge).
- `src/state/`: validation, storage, backup, units, app state provider.
- `src/tabs/`, `src/ui/`: screens and shared components.
- `tools/icon/`: procedural walleye icon renderer (`python3 tools/icon/export_icons.py`); outputs in `assets/` and `public/`.
- `.github/workflows/pages.yml`: tests, build and deploy to GitHub Pages on every push to `main`.

## Decisions log

- PWA with Vite + React + TypeScript; empirical + physical hybrid, learned per lure; reel counter in feet; LiveScope as truth.
- Dropped: current, turns, holder, rod angle, water temperature, per-line weight (18/27/36/45 lb) and backing options, thermocline mode.
- Spelling: the line is "Sufix" (one f); the id `suffix-832` is kept so stored data still matches.

## Open items

- Field data: log real readings, then compare against the starting catalogue and adjust the nominal values (and check the zero-leadcore depth for a 50 ft leader).
- More lures with verified weights, lengths and manufacturer links.
- Optional: other leadcore lines, a different backing, thermocline target helper.
