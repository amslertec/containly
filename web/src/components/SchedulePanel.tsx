import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Play, TriangleAlert } from 'lucide-react';
import {
  SCHEDULE_CATALOG,
  type Frequency,
  type ScheduleJobType,
  type ScheduledJob,
} from '@containly/shared';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Card, Input, Label } from './ui/primitives';
import { Select } from './ui/Select';
import { LoadingState } from './States';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';
import { cn } from '../lib/utils';

const tkey = (type: ScheduleJobType): string => type.replace('.', '_');

export function SchedulePanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.get<{ jobs: ScheduledJob[] }>('/api/schedule'),
    select: (d) => d.jobs,
  });

  if (isLoading || !data) return <Card className="p-5"><LoadingState /></Card>;
  const byType = new Map(data.map((j) => [j.type, j]));

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('schedule.title')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted">
        {t('schedule.info')} · {t('schedule.serverTime', { time: new Date().toLocaleTimeString() })}
      </p>

      <div className="divide-y divide-border rounded-lg border border-border">
        {SCHEDULE_CATALOG.map((meta) => {
          const job = byType.get(meta.type);
          if (!job) return null;
          return (
            <JobRow
              key={meta.type}
              job={job}
              destructive={!!meta.destructive}
              needsPassphrase={!!meta.needsPassphrase}
              onSaved={() => void qc.invalidateQueries({ queryKey: ['schedule'] })}
            />
          );
        })}
      </div>
    </Card>
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function JobRow({
  job,
  destructive,
  needsPassphrase,
  onSaved,
}: {
  job: ScheduledJob;
  destructive: boolean;
  needsPassphrase: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const key = tkey(job.type);
  const [form, setForm] = useState(job);
  const [passphrase, setPassphrase] = useState('');
  useEffect(() => setForm(job), [job]);

  const time = `${String(form.hour).padStart(2, '0')}:${String(form.minute).padStart(2, '0')}`;

  const save = useMutation({
    mutationFn: (patch: Partial<ScheduledJob>) => {
      const next = { ...form, ...patch };
      return api.put(`/api/schedule/${job.type}`, {
        enabled: next.enabled,
        frequency: next.frequency,
        hour: next.hour,
        minute: next.minute,
        weekday: next.weekday,
        passphrase: passphrase || undefined,
      });
    },
    onSuccess: () => {
      setPassphrase('');
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const run = useMutation({
    mutationFn: () => api.post<{ job: ScheduledJob }>(`/api/schedule/${job.type}/run`, {}),
    onSuccess: (res) => {
      if (res.job.lastStatus === 'error') toast.error(res.job.lastDetail ?? t('common.error'));
      else toast.success(res.job.lastDetail ?? t('schedule.ran'));
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const update = (patch: Partial<ScheduledJob>): void => {
    setForm((f) => ({ ...f, ...patch }));
    save.mutate(patch);
  };

  return (
    <div className={cn('px-3 py-3', !form.enabled && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox checked={form.enabled} onChange={() => update({ enabled: !form.enabled })} aria-label={t(`schedule.jobs.${key}.label`)} />
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-medium text-ink">{t(`schedule.jobs.${key}.label`)}</span>
            {destructive && (
              <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                <TriangleAlert className="h-3 w-3" /> {t('schedule.destructive')}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-muted">{t(`schedule.jobs.${key}.desc`)}</div>
        </div>

        {/* Zeitplan */}
        <div className="flex items-center gap-2">
          <Select
            value={form.frequency}
            onChange={(v) => update({ frequency: v as Frequency })}
            options={[
              { value: 'daily', label: t('schedule.daily') },
              { value: 'weekly', label: t('schedule.weekly') },
            ]}
          />
          {form.frequency === 'weekly' && (
            <Select
              value={String(form.weekday)}
              onChange={(v) => update({ weekday: Number(v) })}
              options={WEEKDAYS.map((d) => ({ value: String(d), label: t(`schedule.weekdays.${d}`) }))}
            />
          )}
          <Input
            type="time"
            value={time}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              update({ hour: h ?? 0, minute: m ?? 0 });
            }}
            className="h-8 w-28 font-mono"
          />
        </div>

        <Button variant="subtle" size="sm" onClick={() => run.mutate()} loading={run.isPending}>
          <Play className="h-3.5 w-3.5" /> {t('schedule.runNow')}
        </Button>
      </div>

      {/* Job-spezifische Zusatzfelder + letzter Lauf */}
      {needsPassphrase && (
        <div className="mt-2 max-w-md pl-8">
          <Label htmlFor={`pp-${job.type}`}>{t('schedule.passphrase')}</Label>
          <Input
            id={`pp-${job.type}`}
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onBlur={() => passphrase && save.mutate({})}
            placeholder={form.hasPassphrase ? t('schedule.passphraseSet') : t('schedule.passphraseHint')}
            autoComplete="new-password"
          />
        </div>
      )}
      {job.type === 'auto.update' && (
        <p className="mt-2 pl-8 text-[11.5px] text-faint">{t('schedule.autoUpdateHint')}</p>
      )}
      {job.lastRun && (
        <p className="mt-2 pl-8 text-[11px]">
          <span className="text-faint">{t('schedule.lastRun', { when: relativeTime(job.lastRun) })}</span>{' '}
          <span className={job.lastStatus === 'error' ? 'text-danger' : 'text-run'}>
            {job.lastDetail}
          </span>
        </p>
      )}
    </div>
  );
}
