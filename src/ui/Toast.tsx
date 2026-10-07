import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ToastOptions {
  action?: { label: string; run: () => void };
  /** How long it stays, ms. */
  ms?: number;
}
type Show = (message: string, opts?: ToastOptions) => void;

interface Item {
  id: number;
  message: string;
  action?: ToastOptions["action"];
}

const ToastContext = createContext<Show>(() => {});
export const useToast = () => useContext(ToastContext);

/** Short messages above the nav bar, with an optional action (the "Undo" for deletes). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, number>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<Show>(
    (message, opts) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { id, message, action: opts?.action }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), opts?.ms ?? (opts?.action ? 8000 : 4000)));
    },
    [dismiss],
  );

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((h) => window.clearTimeout(h));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.message}</span>
            {t.action && (
              <button
                className="link"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
