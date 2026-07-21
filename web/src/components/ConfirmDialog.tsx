import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/primitives';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Wenn gesetzt, muss der Nutzer genau diesen Namen eintippen (z. B. Container-Name). */
  confirmText?: string;
  extra?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  options,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  options: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');

  if (!options) return null;
  const needsType = Boolean(options.confirmText);
  const matches = !needsType || typed === options.confirmText;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setTyped('');
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <div className="flex items-start gap-3">
          {options.danger && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle>{options.title}</DialogTitle>
            {options.description && <DialogDescription>{options.description}</DialogDescription>}
          </div>
        </div>

        {options.extra && <div className="mt-4">{options.extra}</div>}

        {needsType && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-muted">
              {t('confirm.typeToConfirm', { name: options.confirmText })}
            </p>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="font-mono"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setTyped('');
              onCancel();
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant={options.danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={!matches}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? t('common.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
