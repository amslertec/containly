import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import { Page, PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/States';

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t(titleKey)} />
      <EmptyState
        icon={<Construction className="h-8 w-8" />}
        title={t(titleKey)}
        hint="…"
      />
    </Page>
  );
}
