import { Toaster as Sonner } from 'sonner';
import { useTheme } from '../lib/theme';

/** App-weite Toast-Ausgabe, an das aktuelle Theme gekoppelt. */
export function Toaster() {
  const mode = useTheme((s) => s.mode);
  return (
    <Sonner
      theme={mode}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--w-surface)',
          color: 'var(--w-ink)',
          border: '1px solid var(--w-border)',
          fontFamily: 'var(--font-sans)',
        },
      }}
    />
  );
}

export { toast } from 'sonner';
