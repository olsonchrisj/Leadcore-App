import { Component, type ReactNode } from "react";
import { downloadText } from "../state/files";
import { allAppKeys } from "../state/storage";

interface State {
  error: Error | null;
  confirmErase: boolean;
}

/** If anything in the app throws, the angler still gets to their data. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, confirmErase: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  private saveRaw = () => {
    const keys: Record<string, string | null> = {};
    for (const k of allAppKeys()) {
      try {
        keys[k] = localStorage.getItem(k);
      } catch {
        keys[k] = null;
      }
    }
    downloadText(`leadcore-raw-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "leadcore-calculator-raw", keys }, null, 2));
  };

  private erase = () => {
    if (!this.state.confirmErase) {
      this.setState({ confirmErase: true });
      return;
    }
    for (const k of allAppKeys()) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash">
        <h1>Something went wrong</h1>
        <p>
          The app hit an unexpected error. Your readings are still stored on this device. Save a copy first, then reload.
        </p>
        <pre>{this.state.error.message}</pre>
        <div className="row">
          <button className="primary" onClick={this.saveRaw}>Save a copy of my data</button>
          <button onClick={() => location.reload()}>Reload</button>
          <button className={this.state.confirmErase ? "danger" : ""} onClick={this.erase}>
            {this.state.confirmErase ? "Tap again to erase everything" : "Erase app data"}
          </button>
        </div>
      </main>
    );
  }
}
