import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

// Selbst-gehostete Schriften (CSP-konform, kein externer Font-Request).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource-variable/space-grotesk'; // Brand-/Display-Schrift (Wortmarke + Headings)
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './styles.css';
import './i18n';
import '@xterm/xterm/css/xterm.css';

import { queryClient } from './lib/queryClient';
import { AuthProvider } from './app/AuthContext';
import { Root } from './app/Root';
import { Toaster } from './components/Toaster';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
