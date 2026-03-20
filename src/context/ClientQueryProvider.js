"use client";
import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { labQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import devLogDefault from '@/utils/dev/logger'

  export const globalQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15 * 60 * 1000,
        gcTime: 12 * 60 * 60 * 1000,
        retry: 2,
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        shouldDehydrateQuery: null, // Will be set below
      },
      mutations: {
        retry: false,
      },
    },
  });

// Create persister for localStorage (sync API, no React Native peer required)
const serializeWithBigIntSupport = (value) =>
  JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : null,
  key: 'decentralabs-query-cache',
  serialize: serializeWithBigIntSupport,
  deserialize: JSON.parse,
});

// Track logged query types to avoid spam and initialization state
const loggedQueryTypes = new Set();
export let isInitialized = false;
export const __resetIsInitializedForTests = () => { isInitialized = false; };

// Exportable logger for test injection
export let devLog = devLogDefault;
export function setDevLogLogger(logger) {
  devLog = logger;
}


export function shouldDehydrateQuery(query) {
  // Safety check - ensure query and queryKey exist
  if (!query || !query.queryKey || !Array.isArray(query.queryKey) || query.queryKey.length === 0) {
    devLog.warn('🚫 shouldDehydrateQuery: Invalid query structure:', query);
    return false;
  }
  // Persist lab, provider, and user queries
  const queryType = query.queryKey[0];
  const shouldPersist = (
    queryType === 'labs' ||
    queryType === 'provider' ||
    queryType === 'providers' ||
    queryType === 'reservations' ||
    queryType === 'bookings' ||
    queryType === 'labImage' ||
    queryType === 'metadata'
  );
  // Only persist successful queries with data
  if (shouldPersist) {
    // Exclude highly volatile reservation sub-queries from persistence
    if (queryType === 'reservations') {
      const subKey = query.queryKey[1];
      if (subKey === 'checkAvailable') {
        return false;
      }
    }
    const state = query.state;
    if (!state || state.status !== 'success' || typeof state.data === 'undefined') {
      return false;
    }
  }
  // Only log once per query type per session to avoid spam
  if (shouldPersist && !loggedQueryTypes.has(queryType)) {
    loggedQueryTypes.add(queryType);
    if (process.env.NODE_ENV === 'development') {
      devLog.log(`💾 Persisting query type: ${queryType}`);
    }
  }
  return shouldPersist;
}

globalQueryClient.setDefaultOptions({
  queries: {
    ...globalQueryClient.getDefaultOptions().queries,
    shouldDehydrateQuery,
  },
});

export default function ClientQueryProvider({ children, logger }) {
  // Allow logger injection for tests
  useEffect(() => {
    if (isInitialized) return;
    const initializeEssentialCaches = () => {
      const log = (...args) => (logger ? logger.log(...args) : devLog.log(...args));
      const warn = (...args) => (logger ? logger.warn(...args) : devLog.warn(...args));
      try {
        log('🏗️ Checking existing cache state on app startup...');
        const allLabsKey = labQueryKeys.getAllLabs();
        const existingLabsData = globalQueryClient.getQueryData(allLabsKey);
        if (existingLabsData && existingLabsData.length > 0) {
          log('📦 Found existing all-labs cache with', existingLabsData.length, 'entries');
        } else {
          log('📦 Memory cache empty on startup - React Query will restore from localStorage or API');
        }
        isInitialized = true;
        log('✅ Cache state check completed');
      } catch (error) {
        warn('⚠️ Failed to check cache state:', error.message);
      }
    };
    initializeEssentialCaches();
  }, [logger]);
  return (
    <PersistQueryClientProvider
      client={globalQueryClient}
      persistOptions={{
        persister,
        maxAge: 72 * 60 * 60 * 1000,
        buster: '',
        dehydrateOptions: {
          shouldDehydrateQuery,
        },
      }}
    >
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  );
}

ClientQueryProvider.propTypes = {
  children: PropTypes.node.isRequired,
  logger: PropTypes.object,
}
