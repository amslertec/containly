import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, Input } from './ui/primitives';
import { toast } from './Toaster';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from './ConfirmDialog';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/utils';

const SECRET_RE = /(pass|pwd|secret|token|key|credential|api[_-]?key|auth)/i;

interface Pair {
  key: string;
  value: string;
}

function parseEnv(env: string[]): Pair[] {
  return env.map((line) => {
    const i = line.indexOf('=');
    return i < 0 ? { key: line, value: '' } : { key: line.slice(0, i), value: line.slice(i + 1) };
  });
}

/**
 * Umgebungsvariablen eines Containers: Ansicht mit Secret-Maskierung (Werte von
 * PASS/SECRET/TOKEN/… verdeckt, per Auge sichtbar). Bearbeiten erstellt den Container
 * mit gleichem Image neu (Docker kann Env nicht live ändern).
 */
export function EnvTab({
  endpoint,
  id,
  env,
  canEdit,
  onSaved,
}: {
  endpoint: string;
  id: string;
  env: string[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { confirm, dialogProps } = useConfirm();
  const original = useMemo(() => parseEnv(env), [env]);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Pair[]>(original);
  const [reveal, setReveal] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const startEdit = (): void => {
    setRows(parseEnv(env));
    setEditing(true);
  };
  const toggleReveal = (i: number): void =>
    setReveal((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const save = async (): Promise<void> => {
    const cleaned = rows.filter((r) => r.key.trim());
    const ok = await confirm({
      title: t('env.saveTitle'),
      description: t('env.recreateWarn'),
      danger: true,
      confirmLabel: t('env.save'),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.post(`/api/containers/${encodeURIComponent(id)}/env?endpoint=${encodeURIComponent(endpoint)}`, {
        env: cleaned.map((r) => `${r.key.trim()}=${r.value}`),
      });
      toast.success(t('env.saved'));
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const view = editing ? rows : original;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">{t('env.title')} · {view.length}</span>
        {canEdit && !editing && (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" /> {t('common.edit')}
          </Button>
        )}
      </div>

      {editing && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('env.recreateWarn')}
        </p>
      )}

      {view.length === 0 && !editing ? (
        <p className="py-6 text-center text-sm text-faint">{t('env.empty')}</p>
      ) : (
        <div className="space-y-1.5">
          {view.map((p, i) => {
            const secret = SECRET_RE.test(p.key);
            const masked = secret && !reveal.has(i);
            return (
              <div key={i} className="flex items-center gap-2">
                {editing ? (
                  <>
                    <Input
                      value={p.key}
                      onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                      className="h-8 w-1/3 font-mono text-[12px]"
                      placeholder="KEY"
                    />
                    <Input
                      type={masked ? 'password' : 'text'}
                      value={p.value}
                      onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      className="h-8 flex-1 font-mono text-[12px]"
                      placeholder="value"
                    />
                    {secret && (
                      <button onClick={() => toggleReveal(i)} className="text-faint hover:text-ink" title={t(masked ? 'auth.showPassword' : 'auth.hidePassword')}>
                        {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                      className="text-faint hover:text-danger"
                      title={t('common.remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="w-1/3 shrink-0 truncate font-mono text-[12px] text-ink" title={p.key}>{p.key}</span>
                    <span className={cn('flex-1 truncate font-mono text-[12px]', masked ? 'text-faint' : 'text-muted')}>
                      {masked ? '••••••••' : p.value}
                    </span>
                    {secret && (
                      <button onClick={() => toggleReveal(i)} className="text-faint hover:text-ink" title={t(masked ? 'auth.showPassword' : 'auth.hidePassword')}>
                        {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, { key: '', value: '' }])}>
            <Plus className="h-4 w-4" /> {t('env.add')}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" size="sm" onClick={() => void save()} loading={saving}>
            {t('env.save')}
          </Button>
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </Card>
  );
}
