import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, DatabaseBackup, Download, Upload } from 'lucide-react';
import type { RestoreResult } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { Button } from './ui/Button';
import { Card, Input, Label } from './ui/primitives';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';

export function BackupPanel() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <BackupCard />
      <RestoreCard />
    </div>
  );
}

function BackupCard() {
  const { t } = useTranslation();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (): Promise<void> => {
    if (pass.length < 8) return;
    setBusy(true);
    try {
      const res = await api.post<{ filename: string; data: string }>('/api/backup', { passphrase: pass });
      const blob = new Blob([res.data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setPass('');
      toast.success(t('backup.created'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Download className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('backup.createTitle')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted">{t('backup.createInfo')}</p>
      <div className="grid gap-3">
        <div>
          <Label htmlFor="bpass">{t('backup.passphrase')}</Label>
          <Input
            id="bpass"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
            placeholder={t('backup.passphraseHint')}
          />
        </div>
        <div>
          <Button variant="primary" size="sm" onClick={() => void create()} loading={busy} disabled={pass.length < 8}>
            <Download className="h-4 w-4" /> {t('backup.createButton')}
          </Button>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[12px] text-warn">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t('backup.secretsWarn')}
      </p>
    </Card>
  );
}

function RestoreCard() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setFileName(f.name);
    setFileText(await f.text());
  };

  const ready = fileText && pass && confirm === 'RESTORE';

  const restore = async (): Promise<void> => {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: true; counts: RestoreResult }>('/api/backup/restore', {
        data: fileText,
        passphrase: pass,
      });
      toast.success(
        t('backup.restored', {
          users: res.counts.users,
          endpoints: res.counts.endpoints,
        }),
      );
      // Zieldaten (inkl. Sessions) ersetzt → neu anmelden.
      setTimeout(() => void logout(), 1500);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      setBusy(false);
    }
  };

  return (
    <Card className="border-danger-soft p-5">
      <div className="mb-1 flex items-center gap-2">
        <DatabaseBackup className="h-5 w-5 text-danger" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('backup.restoreTitle')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-warn">{t('backup.restoreWarn')}</p>
      <div className="grid gap-3">
        <div>
          <Label>{t('backup.file')}</Label>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> {t('backup.chooseFile')}
            </Button>
            <span className="min-w-0 truncate font-mono text-[12px] text-muted">{fileName || '—'}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="rpass">{t('backup.passphrase')}</Label>
          <Input id="rpass" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="rconf">{t('backup.confirmLabel')}</Label>
          <Input
            id="rconf"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="font-mono"
            placeholder="RESTORE"
          />
        </div>
        <div>
          <Button variant="danger" size="sm" onClick={() => void restore()} loading={busy} disabled={!ready}>
            <DatabaseBackup className="h-4 w-4" /> {t('backup.restoreButton')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
