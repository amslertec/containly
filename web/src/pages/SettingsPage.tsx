import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageHeader } from '../components/PageHeader';
import { AuditPanel } from '../components/AuditPanel';
import { BackupPanel } from '../components/BackupPanel';
import { RegistriesPanel } from '../components/RegistriesPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { SchedulePanel } from '../components/SchedulePanel';
import { VersionPanel } from '../components/VersionPanel';
import { useAuth } from '../app/AuthContext';
import { cn } from '../lib/utils';

type Tab = 'version' | 'notifications' | 'schedule' | 'registries' | 'audit' | 'backup';

export function SettingsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const tabs: Tab[] = isAdmin
    ? ['version', 'notifications', 'schedule', 'registries', 'audit', 'backup']
    : ['version'];
  const [tab, setTab] = useState<Tab>('version');

  return (
    <Page>
      <PageHeader eyebrow={t('app.name')} title={t('settings.title')} />

      {/* Tab-Leiste: nur horizontal scrollbar (overflow-y-hidden verhindert den 1px-
          Vertikal-Overflow der Aktiv-Linie); Linie bei bottom-0 statt -bottom-px. */}
      <div className="mb-5 -mx-4 border-b border-border px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                'relative shrink-0 whitespace-nowrap px-3.5 py-2 text-sm font-medium transition-colors',
                tab === tb ? 'text-primary' : 'text-muted hover:text-ink',
              )}
            >
              {t(`settings.tabs.${tb}`)}
              {tab === tb && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      {tab === 'version' && <VersionPanel />}
      {tab === 'notifications' && isAdmin && <NotificationsPanel />}
      {tab === 'schedule' && isAdmin && <SchedulePanel />}
      {tab === 'registries' && isAdmin && <RegistriesPanel />}
      {tab === 'audit' && isAdmin && <AuditPanel />}
      {tab === 'backup' && isAdmin && <BackupPanel />}
    </Page>
  );
}
