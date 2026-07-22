import { useEffect, useState } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowUpCircle,
  Boxes,
  HardDrive,
  Layers,
  LogOut,
  Menu,
  Network,
  Search,
  Server,
  Settings,
  Ship,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Wordmark } from '../components/Logo';
import { EndpointSwitcher } from '../components/EndpointSwitcher';
import { CommandPalette } from '../components/CommandPalette';
import { UpdateModal } from '../components/UpdateModal';
import { LangToggle, ThemeToggle } from '../components/ThemeLangControls';
import { useAuth } from './AuthContext';
import { cn } from '../lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
  exact?: boolean;
  admin?: boolean;
}

const nav: NavItem[] = [
  { to: '/containers', labelKey: 'nav.containers', icon: <Boxes className="h-4 w-4" /> },
  { to: '/images', labelKey: 'nav.images', icon: <Layers className="h-4 w-4" /> },
  { to: '/volumes', labelKey: 'nav.volumes', icon: <HardDrive className="h-4 w-4" /> },
  { to: '/networks', labelKey: 'nav.networks', icon: <Network className="h-4 w-4" /> },
  { to: '/stacks', labelKey: 'nav.stacks', icon: <Ship className="h-4 w-4" /> },
  { to: '/updates', labelKey: 'nav.updates', icon: <ArrowUpCircle className="h-4 w-4" /> },
  { to: '/endpoints', labelKey: 'nav.endpoints', icon: <Server className="h-4 w-4" />, admin: true },
  { to: '/users', labelKey: 'nav.users', icon: <Users className="h-4 w-4" />, admin: true },
  { to: '/settings', labelKey: 'nav.settings', icon: <Settings className="h-4 w-4" /> },
];

export function AppShell() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Globaler Shortcut: Cmd/Ctrl+K öffnet/schließt die Befehlssuche.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = nav.filter((item) => !item.admin || isAdmin);
  const isActive = (item: NavItem): boolean =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  return (
    // Feste Viewport-Höhe: Sidebar bleibt stehen, nur der Inhaltsbereich scrollt.
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Mobile-Overlay */}
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label={t('common.close')}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-bg-sunken',
          'transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Wordmark subtitle={t('app.tagline')} />
          <button
            className="text-muted hover:text-ink lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <EndpointSwitcher />
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={() => setCmdkOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-left text-[13px] text-faint transition-colors hover:border-border-strong hover:text-muted"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">{t('cmdk.trigger')}</span>
            <kbd className="rounded border border-border px-1 py-0.5 text-[10px] leading-none">⌘K</kbd>
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                isActive(item)
                  ? 'bg-primary-soft text-primary'
                  : 'text-muted hover:bg-surface-hover hover:text-ink',
              )}
            >
              {item.icon}
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <UserMenu />
      </aside>

      {/* Hauptbereich */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label={t('common.more')}>
            <Menu className="h-5 w-5 text-muted" />
          </button>
          <Wordmark />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <UpdateModal />
      {cmdkOpen && <CommandPalette onClose={() => setCmdkOpen(false)} />}
    </div>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="border-t border-border p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <LangToggle />
        <ThemeToggle />
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {user?.username}
              </span>
              <span className="eyebrow block" style={{ fontSize: 9 }}>
                {user?.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleViewer')}
              </span>
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            side="top"
            sideOffset={6}
            className="z-50 min-w-[200px] rounded-lg border border-border bg-surface p-1.5"
            style={{ boxShadow: 'var(--w-shadow-lg)' }}
          >
            <DropdownMenu.Item asChild>
              <Link
                to="/profile"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-hover"
              >
                <UserRound className="h-4 w-4" />
                {t('nav.profile')}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={() => void logout()}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
            >
              <LogOut className="h-4 w-4" />
              {t('auth.logout')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
