import { useCallback, useRef, useState } from 'react';
import type { ConfirmOptions } from '../components/ConfirmDialog';

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  loading: boolean;
}

/** Imperativer Bestätigungs-Dialog: `await confirm({...})` liefert true/false. */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, options: null, loading: false });
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setState({ open: true, options, loading: false });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const onCancel = useCallback(() => {
    resolver.current?.(false);
    resolver.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const onConfirm = useCallback(() => {
    resolver.current?.(true);
    resolver.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  return { confirm, dialogProps: { ...state, onConfirm, onCancel } };
}
