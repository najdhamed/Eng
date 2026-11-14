import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ToastValue {
  show(message: string): void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMessage({ text, id: Date.now() });
    timer.current = window.setTimeout(() => setMessage(null), 3600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message && (
          <p className="toast" key={message.id}>
            {message.text}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
