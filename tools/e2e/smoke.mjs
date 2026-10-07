// End-to-end smoke test: drives the built app in headless Chromium.
//
//   npm run build && npx vite preview --port 4173 &
//   node tools/e2e/smoke.mjs            (BASE_URL=http://localhost:4173/ by default)
//
// Needs Playwright (global install or in node_modules) and a Chromium binary
// (CHROMIUM=/path/to/chromium, default /opt/pw-browsers/chromium).
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
for (const base of [import.meta.url, "/opt/node22/lib/node_modules/", "/usr/lib/node_modules/"]) {
  try {
    ({ chromium } = createRequire(base)("playwright"));
    break;
  } catch {}
}
if (!chromium) throw new Error("playwright not found");

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const SHOTS = process.env.SHOTS; // optional directory for screenshots
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
};

async function freshPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  return { ctx, page, errors };
}
const tab = (page, name) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name }).click();
const bigText = async (page) => (await page.locator(".result .big").first().innerText()).replace(/\s+/g, " ").trim();
const counterOf = (txt) => Number(txt.match(/[\d.]+/)?.[0]);
const shot = async (page, name) => SHOTS && (await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false }));

// ---------------------------------------------------------------- basic flow
{
  const { ctx, page, errors } = await freshPage();
  await page.goto(BASE);
  await page.waitForSelector(".result .big");
  const first = counterOf(await bigText(page));
  check("plan shows a counter", first > 20 && first < 400, String(first));

  await page.getByRole("button", { name: /Increase boat speed/ }).click();
  const faster = counterOf(await bigText(page));
  check("faster speed needs more line", faster > first, `${first} -> ${faster}`);
  await page.getByRole("button", { name: /Decrease boat speed/ }).click();
  check("stepper is reversible", counterOf(await bigText(page)) === first);

  await page.getByLabel("Target depth (ft)").fill("45");
  const deeper = counterOf(await bigText(page));
  check("deeper target needs more line", deeper > first, `${first} -> ${deeper}`);
  await page.getByLabel("Target depth (ft)").fill("abc");
  check("garbage in the depth box is ignored", await page.getByLabel("Target depth (ft)").getAttribute("aria-invalid") === "true");
  await page.getByLabel("Target depth (ft)").blur();
  check("and reverts on blur", (await page.getByLabel("Target depth (ft)").inputValue()) === "45");

  // choose a different lure
  await page.getByLabel("Lure type").selectOption("crankbait");
  await page.getByLabel("Brand").selectOption({ label: "Rapala" });
  const rap = counterOf(await bigText(page));
  check("changing lure re-plans", rap !== deeper, `${deeper} -> ${rap}`);

  // log a reading
  await page.getByLabel("Depth (LiveScope) (ft)").fill("41.5");
  await page.getByRole("button", { name: "Save reading" }).click();
  await page.getByText(/Saved:/).waitFor();
  check("saving shows feedback with undo", await page.getByRole("button", { name: "Undo" }).isVisible());
  check("depth box clears after save", (await page.getByLabel("Depth (LiveScope) (ft)").inputValue()) === "");
  await tab(page, "Readings");
  check("reading is listed", (await page.locator(".reading").count()) === 1);
  await shot(page, "readings-1");

  // edit
  await page.locator(".reading-head").first().click();
  await page.locator(".r-edit").getByLabel("Depth (ft)").fill("43");
  await page.getByRole("button", { name: "Save changes" }).click();
  check("edit applies", (await page.locator(".reading .r-nums b").first().innerText()).includes("43"));

  // exclude, then delete + undo
  await page.locator(".reading-head").first().click();
  await page.getByLabel("Leave this reading out of the model").check();
  check("exclude shows a tag", await page.getByText("left out of the model").first().isVisible());
  await page.getByRole("button", { name: "Delete" }).click();
  check("delete removes the row", (await page.locator(".reading").count()) === 0);
  await page.getByRole("button", { name: "Undo" }).last().click();
  check("undo brings it back", (await page.locator(".reading").count()) === 1);

  await tab(page, "Chart");
  await page.waitForSelector("svg.plot");
  check("chart renders table rows", (await page.locator("table.chart tbody tr").count()) > 5);
  check("no NaN anywhere on chart", !(await page.locator("main").innerText()).includes("NaN"));
  await shot(page, "chart");
  await tab(page, "Lures");
  await page.getByLabel("Search lures").fill("ripshad");
  check("lure search filters", (await page.locator(".catalog li").count()) >= 3 && (await page.locator(".catalog li").count()) < 10);
  check("manufacturer links are https", await page.locator('.catalog a[href^="https://"]').count() > 0);
  await tab(page, "Settings");
  check("settings shows a build id", (await page.getByText(/Build \d{4}-\d{2}-\d{2}/).count()) === 1);
  check("no console errors in basic flow", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- backup / restore / erase
{
  const { ctx, page, errors } = await freshPage();
  await page.goto(BASE);
  await page.getByLabel("Depth (LiveScope) (ft)").fill("33");
  await page.getByRole("button", { name: "Save reading" }).click();
  await page.getByText(/Saved:/).waitFor();
  await tab(page, "Settings");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up / share" }).click()]);
  const file = path.join(os.tmpdir(), `lc-backup-${Date.now()}.json`);
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  check("backup has the reading", data.readings.length === 1 && data.app === "leadcore-calculator" && data.version === 2);
  await page.getByText("Backup downloaded").waitFor();
  check("last backup is recorded", (await page.getByText(/Last backup: today/).count()) > 0);

  await page.getByRole("button", { name: "Erase all data…" }).click();
  await page.getByRole("button", { name: "Yes, erase everything" }).click();
  await tab(page, "Readings");
  check("erase empties the log", (await page.getByText("No readings yet").count()) === 1);
  await tab(page, "Settings");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByText(/Restored 1 reading/).waitFor();
  await tab(page, "Readings");
  check("restore brings it back", (await page.locator(".reading").count()) === 1);
  await tab(page, "Settings");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByText(/Nothing new to restore/).waitFor();
  await tab(page, "Readings");
  check("restoring twice doesn't duplicate", (await page.locator(".reading").count()) === 1);

  const bad = path.join(os.tmpdir(), `lc-bad-${Date.now()}.json`);
  fs.writeFileSync(bad, '{"hello":"world"}');
  await tab(page, "Settings");
  await page.locator('input[type="file"]').setInputFiles(bad);
  await page.getByText(/doesn't contain any readings/).waitFor();
  await tab(page, "Readings");
  check("a bad file changes nothing", (await page.locator(".reading").count()) === 1);
  check("no console errors in backup flow", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- hostile storage
{
  const { ctx, page, errors } = await freshPage();
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("lc.readings", JSON.stringify([{ nonsense: true }, null, 7, { counterFt: "x" }]));
    localStorage.setItem("lc.rig", "{not json");
    localStorage.setItem("lc.lures", JSON.stringify({ not: "an array" }));
    localStorage.setItem("lc.settings", JSON.stringify({ theme: "neon", speedUnit: 3 }));
  });
  await page.goto(BASE);
  await page.waitForSelector(".result .big");
  check("app survives corrupt storage", counterOf(await bigText(page)) > 0);
  const rescued = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(".rescued.")));
  check("and keeps copies of what it dropped", rescued.length >= 2, rescued.join(","));
  check("no console errors with corrupt storage", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- units and theme
{
  const { ctx, page, errors } = await freshPage({ colorScheme: "dark" });
  await page.goto(BASE);
  await page.waitForSelector(".result .big");
  const ft = counterOf(await bigText(page));
  await tab(page, "Settings");
  await page.getByLabel("Depth and line").selectOption("m");
  await page.getByLabel("Speed", { exact: true }).selectOption("kmh");
  await page.getByLabel("Theme").selectOption("light");
  check("theme attribute applied", (await page.locator("html").getAttribute("data-theme")) === "light");
  await tab(page, "Plan");
  const m = Number((await bigText(page)).match(/[\d.]+/)[0]);
  check("counter converts to metres", Math.abs(m - ft * 0.3048) < 0.2, `${ft} ft -> ${m} m`);
  check("speed shows in km/h", (await page.getByLabel("Boat speed (km/h)").inputValue()) === "3.2");
  await page.getByLabel("Boat speed (km/h)").fill("3,5"); // comma decimal
  check("comma decimals accepted", (await page.getByLabel("Boat speed (km/h)").getAttribute("aria-invalid")) === null);
  await shot(page, "plan-light-metric");
  await tab(page, "Chart");
  check("chart has no NaN in metric", !(await page.locator("main").innerText()).includes("NaN"));
  // theme survives reload without a flash of the wrong one
  await page.reload();
  check("theme persists", (await page.locator("html").getAttribute("data-theme")) === "light");
  check("no console errors in units flow", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------------------------------------------------------- a season of readings, on a slow phone
{
  const { ctx, page, errors } = await freshPage();
  const readings = [];
  const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const lures = [["williams-wabler-w40", "spoon", 0.25], ["rapala-shad-rap-sr07", "crankbait", 0.3125], ["acme-little-cleo-1-3-oz", "spoon", 0.33]];
  for (let i = 0; i < 40; i++) {
    const [id, type, w] = lures[i % 3];
    const speed = 1.6 + 0.2 * (i % 7);
    const counter = 60 + 20 * ((i * 5) % 14);
    const depth = (0.2 * Math.min(counter, 300) + 0.15 * Math.max(counter - 300, 0)) * (2 / speed) * (1 + 0.04 * (rand() - 0.5)) + 6;
    readings.push({ id: "seed-" + i, takenAt: new Date(2026, 8, 1 + i).toISOString(), lineId: "suffix-832", leadcoreLengthFt: 300, speedMph: Math.round(speed * 10) / 10, lure: { id, type, weightOz: w }, leader: { material: "fluorocarbon", lengthFt: 50 }, counterFt: counter, depthFt: Math.round(depth * 10) / 10 });
  }
  readings.push({ ...readings[0], id: "typo", counterFt: 150, depthFt: 4.2 }); // a mistyped depth
  await ctx.addInitScript((r) => { if (!localStorage.getItem("lc.readings")) localStorage.setItem("lc.readings", JSON.stringify(r)); }, readings);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t0 = Date.now();
  await page.goto(BASE);
  await page.waitForSelector(".result .big");
  const load = Date.now() - t0;
  check("loads 41 readings fast on a 4x slower CPU", load < 4000, `${load} ms`);

  await page.getByLabel("Depth (LiveScope) (ft)").fill("30");
  const t1 = Date.now();
  await page.getByRole("button", { name: "Save reading" }).click();
  await page.getByText(/Saved:/).waitFor();
  const save = Date.now() - t1;
  check("saving a reading (refit) is quick on a 4x slower CPU", save < 2500, `${save} ms`);

  await tab(page, "Readings");
  await page.getByRole("button", { name: /^Look off/ }).click();
  check("the typo is flagged and can be filtered to", (await page.locator(".reading.flagged").count()) === 1 && (await page.locator(".reading").count()) === 1);
  await page.getByRole("button", { name: /^All/ }).click();
  check("accuracy is reported", (await page.getByText(/usually lands within about/).count()) === 1);
  await shot(page, "readings-season");
  await tab(page, "Chart");
  await page.waitForSelector("svg.plot");
  await shot(page, "chart-season");
  await tab(page, "Lures");
  check("lure insights appear", (await page.locator(".tip").count()) >= 1);
  check("no console errors with a season of data", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
