import { useEffect, useState, useSyncExternalStore } from "react";
import type { Parsed } from "./validate";

/** How one piece of persisted state is read back: through a parser that never throws. */
export interface StoredSpec<T> {
  key: string;
  parse: (raw: unknown) => Parsed<T>;
}

const RESCUE_COPIES = 3;

/** Keeps a copy of data we had to repair or drop, so nothing is lost silently. */
function rescue(key: string, text: string) {
  try {
    const prefix = `${key}.rescued.`;
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) old.push(k);
    }
    old.sort().slice(0, Math.max(0, old.length - (RESCUE_COPIES - 1))).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(`${prefix}${Date.now()}`, text);
  } catch {
    /* storage is full or unavailable: nothing more we can do */
  }
}

export function loadStored<T>(spec: StoredSpec<T>): T {
  let text: string | null = null;
  try {
    text = localStorage.getItem(spec.key);
  } catch {
    return spec.parse(undefined).value;
  }
  if (text === null) return spec.parse(undefined).value;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    rescue(spec.key, text);
    return spec.parse(undefined).value;
  }
  const { value, dropped } = spec.parse(raw);
  if (dropped > 0) rescue(spec.key, text);
  return value;
}

// ---- "couldn't save" flag, shared by every stored value
let failed = false;
const listeners = new Set<() => void>();
function setFailed(v: boolean) {
  if (failed === v) return;
  failed = v;
  listeners.forEach((l) => l());
}
export function useStorageFailed(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => failed,
    () => false,
  );
}

/**
 * State that survives reloads. Reads are validated, writes that fail (private
 * mode, full storage) raise a flag the UI can show, and changes made in another
 * tab or window of the app are picked up.
 */
export function useStored<T>(spec: StoredSpec<T>) {
  const [value, setValue] = useState<T>(() => loadStored(spec));
  useEffect(() => {
    try {
      localStorage.setItem(spec.key, JSON.stringify(value));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [spec.key, value]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea === localStorage && (e.key === null || e.key === spec.key)) setValue(loadStored(spec));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [spec]);
  return [value, setValue] as const;
}

/** Every key this app has written (including rescued copies). */
export function allAppKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("lc.")) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  return keys;
}
