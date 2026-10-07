# Leadcore Trolling Calculator

Tells you what to set the reel counter to for a target depth with leadcore, and gets more accurate every time you log a LiveScope reading. Built around Sufix 832 (and a generic leadcore option), a counter in feet zeroed at the rod tip, and inland-lake trolling.

**Use it:** https://olsonchrisj.github.io/Leadcore-App/ (open it on your phone and add it to the Home Screen; it works offline).

## How to use it

1. **Plan:** set the target depth and boat speed, pick your lure (type, brand, model), attractor and leader. The big number is the counter to set, with the range you will likely land in.
2. Let the line settle for a minute at a steady speed, read the depth on LiveScope, and **log it** (counter + depth).
3. The more readings (different speeds and line out, different lures), the tighter the numbers get. **Readings** shows how each one compares with the model and flags ones that look off (a mistyped depth, a line that hadn't settled); you can edit them or leave them out.
4. **Chart** shows depth against line out for the current rig, and a table of counters for every depth and speed.
5. **Back up** from Settings after a trip. Data lives only on the device.

Starting values for the line and lures are engineering estimates, not measurements: until you've logged readings, treat the range as the honest answer.

## How it works

Depth comes from a towed-cable physics model (leader, leadcore and backing, each with its own weight and drag, ending in the lure), and your readings calibrate a handful of physical factors (how hard the line sinks, how much each lure pulls, how the leader behaves) with Bayesian priors, so a few readings help a lot and the 80% range reflects what's actually known. Details, equations and validation are in [`SPEC.md`](SPEC.md).

## Development

```
npm install
npm run dev        # dev server
npm test           # 87 unit tests: physics, fitting, state, data
npm run build      # typecheck + production build in dist/
```

End-to-end check in a real browser (needs Playwright and Chromium):

```
npx vite preview --port 4173 &
node tools/e2e/smoke.mjs
```

The app icon is rendered procedurally (`tools/icon/`, see its README). Pushes to `main` run the tests, build and deploy to GitHub Pages (Settings → Pages → Source: GitHub Actions).
