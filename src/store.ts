import { useCallback, useEffect, useState } from "react";

/** localStorage-backed state that still works when storage is unavailable. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota: keep working in memory */
    }
  }, [key, value]);
  const update = useCallback((v: T | ((p: T) => T)) => setValue(v), []);
  return [value, update] as const;
}
