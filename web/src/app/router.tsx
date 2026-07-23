import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { AppShell } from './AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ContainersPage } from '../pages/ContainersPage';
import { ContainerDetailPage } from '../pages/ContainerDetailPage';
import { ImagesPage } from '../pages/ImagesPage';
import { VolumesPage } from '../pages/VolumesPage';
import { NetworksPage } from '../pages/NetworksPage';
import { StacksPage, StackDetailPage } from '../pages/StacksPage';
import { CatalogPage } from '../pages/CatalogPage';
import { UpdatesPage } from '../pages/UpdatesPage';
import { EndpointsPage } from '../pages/EndpointsPage';
import { EndpointOverviewPage } from '../pages/EndpointOverviewPage';
import { UsersPage } from '../pages/UsersPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ProfilePage } from '../pages/ProfilePage';

const rootRoute = createRootRoute({ component: AppShell });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/overview', component: OverviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/containers', component: ContainersPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/containers/$id',
    component: ContainerDetailPage,
    validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
      tab: typeof search.tab === 'string' ? search.tab : undefined,
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/images', component: ImagesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/volumes', component: VolumesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/networks', component: NetworksPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/stacks', component: StacksPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/stacks/$id', component: StackDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/catalog', component: CatalogPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/updates', component: UpdatesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/endpoints', component: EndpointsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/endpoints/$id',
    component: EndpointOverviewPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/users', component: UsersPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/profile', component: ProfilePage }),
];

const routeTree = rootRoute.addChildren(routes);

const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
