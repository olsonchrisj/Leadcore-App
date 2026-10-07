import { useEffect, useRef, useState } from "react";
import { AppStateProvider, useApp } from "./state/AppState";
import { Chart } from "./tabs/Chart";
import { Lures } from "./tabs/Lures";
import { Plan } from "./tabs/Plan";
import { Readings } from "./tabs/Readings";
import { Settings } from "./tabs/Settings";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Icon } from "./ui/Icons";
import { TABS, type TabId } from "./ui/tabs";
import { ToastProvider } from "./ui/Toast";

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppStateProvider>
          <Shell />
        </AppStateProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const [tab, setTab] = useState<TabId>("plan");
  const { storageFailed, fitFailed, readings, exportData } = useApp();
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Move focus to the page title when the screen changes, so keyboard and screen-reader users land at the top.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [tab]);

  const title = TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="app">
      <header className="top">
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <span className="brand">Leadcore</span>
      </header>

      {storageFailed && (
        <div className="banner" role="alert">
          <span>Couldn't save to this device, so new readings won't survive a restart. Back up now.</span>
          <button onClick={exportData} disabled={readings.length === 0}>
            Back up
          </button>
        </div>
      )}
      {fitFailed && (
        <div className="banner" role="alert">
          The model couldn't be fitted to your readings, so these are starting estimates. Check Readings for anything odd.
        </div>
      )}

      <main id="main">
        {/* Plan stays mounted so a half-typed reading survives a trip to another screen. */}
        <div hidden={tab !== "plan"}>
          <Plan goTo={setTab} />
        </div>
        {tab === "chart" && <Chart />}
        {tab === "readings" && <Readings goTo={setTab} />}
        {tab === "lures" && <Lures goTo={setTab} />}
        {tab === "settings" && <Settings />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
