import { useAuth } from './AuthContext';
import { EndpointProvider } from './EndpointContext';
import { AppRouter } from './router';
import { SetupPage } from '../pages/SetupPage';
import { LoginPage } from '../pages/LoginPage';
import { LogoMark } from '../components/Logo';

/**
 * Oberste Weiche: Setup-Modus → Login → authentifizierte App.
 * Solange kein Admin existiert, ist ausschließlich der Setup-Flow erreichbar.
 */
export function Root() {
  const { ready, setupComplete, user } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <LogoMark className="h-12 w-12 animate-pulse" />
      </div>
    );
  }

  if (!setupComplete) return <SetupPage />;
  if (!user) return <LoginPage />;

  return (
    <EndpointProvider>
      <AppRouter />
    </EndpointProvider>
  );
}
