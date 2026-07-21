import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageHeader } from '../components/PageHeader';
import { AuditPanel } from '../components/AuditPanel';
import { BackupPanel } from '../components/BackupPanel';
import { RegistriesPanel } from '../components/RegistriesPanel';
import { useAuth } from '../app/AuthContext';
import { cn } from '../lib/utils';

type Tab = 'audit' | 'registries' | 'backup';

export function SettingsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const tabs: Tab[] = isAdmin ? ['audit', 'registries', 'backup'] : ['audit'];
  const [tab, setTab] = useState<Tab>('audit');

  return (
    <Page>
      <PageHeader eyebrow={t('app.name')} title={t('settings.title')} />

      {isAdmin && (
        <div className="mb-5 flex gap-1 border-b border-border">
          {tabs.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                'relative px-3.5 py-2 text-sm font-medium transition-colors',
                tab === tb ? 'text-primary' : 'text-muted hover:text-ink',
              )}
            >
              {t(`settings.tabs.${tb}`)}
              {tab === tb && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      )}

      {tab === 'audit' && <AuditPanel />}
      {tab === 'registries' && isAdmin && <RegistriesPanel />}
      {tab === 'backup' && isAdmin && <BackupPanel />}
    </Page>
  );
}
