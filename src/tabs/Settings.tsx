import { useState } from "react";
import { LINES } from "../engine";
import { useApp } from "../state/AppState";
import { ago } from "../state/readings";
import type { LengthUnit, SpeedUnit, Theme } from "../state/types";
import { NumInput } from "../ui/NumInput";

export function Settings() {
  const { settings, setSettings, rig, setRig, units, readings, lures, atts, exportData, importFile, eraseAll, persisted } = useApp();
  const [confirmErase, setConfirmErase] = useState(false);
  const installed =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const customs = lures.filter((l) => l.custom).length + atts.filter((a) => a.custom).length;

  return (
    <>
      <section className="card">
        <h2>Units and display</h2>
        <div className="grid">
          <div className="field">
            <label htmlFor="u-speed">Speed</label>
            <select id="u-speed" value={settings.speedUnit} onChange={(e) => setSettings({ speedUnit: e.target.value as SpeedUnit })}>
              <option value="mph">mph</option>
              <option value="kn">knots</option>
              <option value="kmh">km/h</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="u-len">Depth and line</label>
            <select id="u-len" value={settings.lengthUnit} onChange={(e) => setSettings({ lengthUnit: e.target.value as LengthUnit })}>
              <option value="ft">feet</option>
              <option value="m">meters</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="u-theme">Theme</label>
            <select id="u-theme" value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as Theme })}>
              <option value="auto">Match phone</option>
              <option value="dark">Dark</option>
              <option value="light">Light (sunny day)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Reel</h2>
        <div className="field">
          <label htmlFor="line">Leadcore</label>
          <select id="line" value={rig.lineId} onChange={(e) => setRig({ lineId: e.target.value })}>
            {Object.values(LINES).map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <NumInput
          label="Leadcore spooled"
          unit={units.length}
          value={rig.leadcoreFt}
          onChange={(v) => v !== null && setRig({ leadcoreFt: v })}
          min={30}
          max={1500}
          hint="100 yd is 300 ft. Zero the counter when the leadcore reaches the rod tip; anything past this number is backing."
        />
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p>
          {readings.length} reading{readings.length === 1 ? "" : "s"}
          {customs > 0 ? `, ${customs} custom lure${customs === 1 ? "" : "s"} or attractor${customs === 1 ? "" : "s"}` : ""}. It lives on this device only, so back it up after a trip.
        </p>
        <div className="row">
          <button className="primary" onClick={exportData}>
            Back up / share
          </button>
          <label className="button">
            Restore from file
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
          </label>
        </div>
        <p className="hint">
          Last backup: {ago(settings.lastBackupAt)}. Restoring adds what's missing and never overwrites what's already here.
          {persisted === true && " This browser has promised not to clear your data automatically."}
          {persisted === false && " The browser may clear this data if the phone runs low on space, so back up often."}
        </p>
        {!installed && (
          <p className="hint">
            Tip: add this app to your Home Screen (in Safari: Share, then Add to Home Screen). It then works offline, and Safari won't clear its data after a week of not using it.
          </p>
        )}
        <div className="row">
          {!confirmErase ? (
            <button className="danger" onClick={() => setConfirmErase(true)}>
              Erase all data…
            </button>
          ) : (
            <>
              <span className="warn">This deletes every reading and custom lure on this device.</span>
              <button
                className="danger"
                onClick={() => {
                  eraseAll();
                  setConfirmErase(false);
                }}
              >
                Yes, erase everything
              </button>
              <button onClick={() => setConfirmErase(false)}>Cancel</button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <details>
          <summary>How the numbers are worked out</summary>
          <p>
            The app treats your leader, leadcore and backing as one flexible line towed through the water. It balances the weight of each piece against the drag of the water at your
            speed, works out the shape the line settles into from the lure back to the boat, and reads off the depth. That is why speed, leader length and lure drag all matter, and why
            the line isn't at one steady angle along its length.
          </p>
          <p>
            The starting values for the line, leader and each lure type are engineering estimates, not measurements. Every reading you log teaches the model how your actual gear
            differs: how hard your leadcore sinks, how much each lure pulls, how the leader behaves. Readings for one lure also help the others of its type. The more varied your
            readings (different speeds and line out), the better.
          </p>
          <p>
            The range shown is where the model expects the lure to run 8 times out of 10. If a reading looks wrong (a mistyped depth, or the line hadn't settled) it is
            flagged on the Readings screen, and you can leave it out.
          </p>
          <p>
            For best results: let the line settle for a minute at a steady speed before reading LiveScope, log the counter as it is on the reel, and log across a spread of speeds.
          </p>
        </details>
      </section>

      <p className="hint about">
        Build {__BUILD_ID__}. Model and lure data are open source:{" "}
        <a href="https://github.com/olsonchrisj/Leadcore-App" target="_blank" rel="noreferrer">
          github.com/olsonchrisj/Leadcore-App
        </a>
        .
      </p>
    </>
  );
}

