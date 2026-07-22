import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, LayoutGrid, Server } from 'lucide-react';
import type { Endpoint, EndpointStatus } from '@containly/shared';
import { ALL_HOSTS, useEndpoints } from '../app/EndpointContext';
import { cn } from '../lib/utils';

const statusTone: Record<EndpointStatus, string> = {
  online: 'var(--w-run)',
  offline: 'var(--w-stop)',
  unauthorized: 'var(--w-danger)',
  unknown: 'var(--w-faint)',
};

function HealthDot({ status }: { status: EndpointStatus }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: statusTone[status] }}
      title={status}
    />
  );
}

export function EndpointSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { endpoints, selected, isAll, setSelected, current } = useEndpoints();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onOverview = pathname.startsWith('/endpoints/');

  // Detailseiten (/containers/:id, /stacks/:id) gehören zu EINEM Host. Wechselt man den
  // Endpoint, existiert das Objekt dort nicht → zurück zur jeweiligen Liste.
  const detailListRoute = (): string | null => {
    if (/^\/containers\/[^/]+$/.test(pathname)) return '/containers';
    if (/^\/stacks\/[^/]+$/.test(pathname)) return '/stacks';
    return null;
  };

  const afterSwitch = (): void => {
    const list = detailListRoute();
    if (list) void navigate({ to: list });
  };

  const openEndpoint = (id: string): void => {
    setSelected(id);
    if (onOverview) void navigate({ to: '/endpoints/$id', params: { id } });
    else afterSwitch();
  };

  const openAll = (): void => {
    setSelected(ALL_HOSTS);
    if (onOverview) void navigate({ to: '/' });
    else afterSwitch();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2',
            'text-left transition-colors hover:border-border-strong hover:bg-surface-hover',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          {isAll ? (
            <LayoutGrid className="h-4 w-4 shrink-0 text-muted" />
          ) : (
            <Server className="h-4 w-4 shrink-0 text-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="eyebrow block" style={{ fontSize: 9 }}>
              {t('endpoint.health')}
            </span>
            <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
              {isAll ? (
                <span className="truncate">{t('endpoint.allHosts')}</span>
              ) : (
                <>
                  {current && <HealthDot status={current.status} />}
                  <span className="truncate">{current?.name ?? t('endpoint.select')}</span>
                </>
              )}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-faint" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[220px] rounded-lg border border-border bg-surface p-1.5"
          style={{ boxShadow: 'var(--w-shadow-lg)' }}
        >
          <DropdownMenu.Item
            onSelect={openAll}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-hover"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-muted" />
            <span className="flex-1 truncate">{t('endpoint.allHosts')}</span>
            {isAll && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {endpoints.map((e: Endpoint) => (
            <DropdownMenu.Item
              key={e.id}
              onSelect={() => openEndpoint(e.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
                'text-ink data-[highlighted]:bg-surface-hover',
              )}
            >
              <HealthDot status={e.status} />
              <span className="flex-1 truncate">{e.name}</span>
              {e.dockerVersion && (
                <span className="font-mono text-[11px] text-faint">{e.dockerVersion}</span>
              )}
              {e.id === selected && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
