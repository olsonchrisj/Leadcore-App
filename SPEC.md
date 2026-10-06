# Leadcore Trolling Calculator — Spec (draft)

## Goal
Given speed, leadcore (brand + weight), backing, leader, lure/attractor, rod setup and conditions, compute **how much leadcore (colors + ft/yd) to let out** to reach a target depth — and the inverse (depth for a given number of colors). Precision comes from a per-rig calibration layer on top of baseline data.

## Decisions from interview
- Platform: installable PWA, offline-capable, data stored locally. Stack: Vite + React + TypeScript.
- Method: empirical baseline tables + interpolation, corrected by a per-rig calibration offset.
- Output: counter reading in feet (primary), with colors (10 yd each) as a derived label; imperial/metric toggle.
- Fishery focus: inland lakes (walleye, trout, kokanee); presets/defaults biased accordingly.
- Lures: built-in database + user-defined custom entries. Types: spoons & flasher/fly rigs, crankbaits & stickbaits, Dipsy/diver-type, plugs/jigs/soft baits (hootchies, squid, bucktails).
- Rig inputs: leadcore brand + weight (18/27/36/45 lb), backing type/diameter, rod angle & holder position, leader length/material/test.
- Conditions: water temp / thermocline target, turns, current, wind.

## Research status (honest)
Web search returned mostly scraped/SEO pages; the two substantive forum sources were blocked by the network proxy, and no manufacturer-published per-brand dive tables were retrieved. What was found (unverified, secondary):
- Traditional leadcore ≈ 4–5 ft of depth per color at ~2.0 mph with ~1 oz lure; microfilament (e.g. Suffix 832) ≈ 30% more (~7 ft/color).
- Depth shifts roughly ±0.25 ft per ¼ oz lure weight difference.
- Faster = shallower; drag from lure/attractor, line diameter and current reduce depth.
- One cited precision-trolling dataset (10 colors, 50 ft mono leader): 18 lb ≈ 58 ft @2.0 mph / 31 ft @3.0; 27 lb ≈ 59 / 29; 36 lb ≈ 57 / 32 (note the weight-independence looks suspect).

**Implication:** baseline numbers must ship as clearly-labelled *estimates* with source notes, editable, and calibration is the primary accuracy mechanism. Needs user-supplied or manufacturer data to be trustworthy per brand.

## Calculation design
1. `depthPerColor(line, speed)` from a table (rows: line profile; cols: speed 1.0–3.5 mph), linearly interpolated.
2. Adjust for: lure weight (± per oz), lure/attractor drag factor (type-specific, user-overridable), leader length (leader adds ~its own depth contribution at its own sink rate), backing diameter/type (backing beyond leadcore sinks little; included for total line out), rod angle, current/turns/wind as % modifiers.
3. Solve for colors: invert monotonic depth(colors) numerically (bisection) so the inverse is exact w.r.t. the forward model.
4. Calibration: user logs (colors out, speed, observed depth) per rig; fit multiplicative factor (and optional speed slope) by least squares; show confidence/residuals.
5. Thermocline mode: enter target temp + temp profile → target depth.

## Data model (JSON, versioned, importable/exportable)
- `LeadcoreLine {brand, name, weightLb, colorLengthFt, tableByMph, source, confidence}`
- `Lure {id, type, name, brand, weightOz, divesFt?, dragFactor, attractorRequired?, source, custom}`
- `Rig {line, backing, leader, rodAngleDeg, holder, calibration}`
- `Trip/Log {date, water, tempProfile, entries[]}`

## Milestones
1. Calc engine (pure TS) + unit tests (monotonicity, round-trip, interpolation, unit conversion).
2. UI: rig builder, calculator, results with ±range, unit toggle.
3. Lure DB + custom editor; import/export.
4. Calibration + logs.
5. PWA/offline, polish.

## Open items
- Data sourcing: user-supplied tables vs. further research (need unblocked sources or manufacturer PDFs).
- Confirm exact brands the user fishes (to prioritize table entry).

## Reel counter model (user setup)
- Counter reads feet and is zeroed when the leadcore reaches the rod tip, so the counter equals leadcore out (leader and lure are already out and not counted).
- Leadcore is spliced directly to backing; 100 yd (300 ft, 10 colors) spooled. Counter > 300 ft means backing is out: `leadcore_out = min(counter, leadcoreLengthFt)`, `backing_out = max(counter - leadcoreLengthFt, 0)`.
- Leader length is a separate rig input (affects depth/drag, not the counter).
- Counter accuracy is a fitted calibration factor, separate from the dive curve; the user can pin it if checked against a measured length.
- Regression works in feet of leadcore out (continuous), not whole colors.
- Depth data source: Garmin LiveScope readings logged per lure/rig.
- Per-lure curves: hierarchical Bayesian ridge (global line -> lure type -> lure model -> rig offset) with partial pooling and prediction bands.

## Engine (implemented in `src/engine`)
- Leader is a free input: material (fluorocarbon/mono/braid/wire/other), length (ft), optional test (lb). Each material has its own length coefficient; test lb scales drag. Priors are unverified and learn from data.
- Model: Bayesian linear regression on `ln(depth / leadcoreOut)`; params for line, lure type, lure model, attractor, rig. Physical constraints (faster = shallower, more line = deeper) enforced per lure.
- API: `fitModel(observations)`, `predictDepth(model, config, counterFt)`, `solveCounter(model, config, targetDepthFt)` with 80% band.
- Not yet modelled: rod angle/holder, current/wind/turns, thermocline mode, counter correction factor (not separable from the dive curve).

## UI (implemented)
Vite + React PWA, data in localStorage. Calculator tab: rig (leadcore on reel, speed, leader material/length, lure, attractor), plan (target depth -> counter with 80% range), log reading (counter + LiveScope depth). Readings tab: list/delete, JSON import/export. Suffix 832 only. Lures tab: names/types only, search, custom lures/attractors. Water temp, notes, leader test and lure weight inputs removed (decluttered). Rod angle, holder, current, turns dropped by decision (lake fishing).
Not yet: metric toggle, thermocline/target-depth helper, offline install testing on a phone.
