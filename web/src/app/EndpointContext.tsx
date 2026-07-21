import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Endpoint } from '@containly/shared';
import { api } from '../lib/api';

const STORAGE_KEY = 'containly-endpoint';
/** Spezialwert: alle Hosts kombiniert. */
export const ALL_HOSTS = 'all';

interface EndpointContextValue {
  endpoints: Endpoint[];
  selected: string;
  isAll: boolean;
  setSelected: (id: string) => void;
  current: Endpoint | undefined;
  /** IDs der Endpoints, die die aktuelle Auswahl umfasst (für kombinierte Listen). */
  scopeIds: string[];
  isLoading: boolean;
  refetch: () => void;
}

const EndpointContext = createContext<EndpointContextValue | null>(null);

export function EndpointProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelectedState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'local';
    } catch {
      return 'local';
    }
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['endpoints'],
    queryFn: () => api.get<{ endpoints: Endpoint[] }>('/api/endpoints'),
    refetchInterval: 30_000,
  });

  const endpoints = useMemo(() => data?.endpoints ?? [], [data]);

  // Falls der gewählte Endpoint verschwindet, auf den ersten verfügbaren zurückfallen ('all' bleibt gültig).
  useEffect(() => {
    if (endpoints.length > 0 && selected !== ALL_HOSTS && !endpoints.some((e) => e.id === selected)) {
      setSelectedState(endpoints[0]!.id);
    }
  }, [endpoints, selected]);

  const setSelected = (id: string): void => {
    setSelectedState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<EndpointContextValue>(() => {
    const isAll = selected === ALL_HOSTS;
    const scopeIds = isAll
      ? endpoints.filter((e) => e.status === 'online').map((e) => e.id)
      : [selected];
    return {
      endpoints,
      selected,
      isAll,
      setSelected,
      current: endpoints.find((e) => e.id === selected),
      scopeIds,
      isLoading,
      refetch: () => void refetch(),
    };
  }, [endpoints, selected, isLoading, refetch]);

  return <EndpointContext.Provider value={value}>{children}</EndpointContext.Provider>;
}

export function useEndpoints(): EndpointContextValue {
  const ctx = useContext(EndpointContext);
  if (!ctx) throw new Error('useEndpoints muss innerhalb von EndpointProvider verwendet werden');
  return ctx;
}
