import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useAudit } from '../hooks/admin';
import { Badge, Input } from './ui/primitives';
import { TableWrap, THead, Th, Tr, Td } from './ui/Table';
import { LoadingState, ErrorState, EmptyState } from './States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './ui/Pagination';
import { absoluteTimeLocalized } from '../lib/time';
import { auditActionLabel } from '../lib/auditActions';

const DANGEROUS = new Set(['exec', 'stack.deploy', 'stack.down']);

/** Audit-Log-Inhalt (Suche + Tabelle), ohne Seiten-Rahmen — für den Settings-Tab. */
export function AuditPanel() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { data, isLoading, isError, error, refetch } = useAudit(isAdmin);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        auditActionLabel(e.action).toLowerCase().includes(q) ||
        (e.username ?? '').toLowerCase().includes(q) ||
        (e.target ?? '').toLowerCase().includes(q),
    );
  }, [data, query]);

  const pg = usePagination(filtered, 10);

  if (!isAdmin) {
    return <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title={t('roles.adminRequired')} hint="" />;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted">{t('audit.subtitle')}</p>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('common.search')}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('audit.empty')} />
      ) : (
        <TableWrap>
          <THead>
            <Th>{t('audit.columns.time')}</Th>
            <Th>{t('audit.columns.user')}</Th>
            <Th>{t('audit.columns.action')}</Th>
            <Th>{t('audit.columns.target')}</Th>
            <Th>{t('audit.columns.outcome')}</Th>
            <Th>{t('audit.columns.ip')}</Th>
          </THead>
          <tbody>
            {pg.pageItems.map((e) => (
              <Tr key={e.id}>
                <Td>
                  <span className="text-[13px] text-muted tabular">
                    {absoluteTimeLocalized(e.ts.replace(' ', 'T') + 'Z')}
                  </span>
                </Td>
                <Td>
                  <span className="text-ink">{e.username ?? '—'}</span>
                </Td>
                <Td>
                  <span
                    className={DANGEROUS.has(e.action) ? 'font-medium text-signal' : 'text-ink'}
                    title={e.action}
                  >
                    {auditActionLabel(e.action)}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono text-[11px] text-faint break-all">{e.target ?? '—'}</span>
                </Td>
                <Td>
                  <Badge tone={e.outcome === 'ok' ? 'run' : e.outcome === 'denied' ? 'warn' : 'danger'}>
                    {t(`audit.outcome.${e.outcome}`)}
                  </Badge>
                </Td>
                <Td>
                  <span className="font-mono text-[11px] text-faint">{e.ip ?? '—'}</span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {!isLoading && !isError && filtered.length > 0 && <Pagination pg={pg} />}
    </div>
  );
}
