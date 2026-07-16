"use client";
import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { labQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

export const globalQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default cache time (15 minutes for general blockchain data)
      staleTime: 15 * 60 * 1000,
      // Time before garbage collection (12 hours general)
      gcTime: 12 * 60 * 60 * 1000,
      // Retry on error
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Disable refetch on focus by default (blockchain data doesn't change frequently)
      refetchOnWindowFocus: false,
      // Refetch when reconnecting
      refetchOnReconnect: true,
    },
    mutations: {
      // Disable retry for mutations to avoid UX issues with repeated prompts
      retry: false,
    },
  },
});

// Create persister for localStorage (sync API, no React Native peer required)
const serializeWithBigIntSupport = (value) =>
  JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));

export const PERSISTED_QUERY_CACHE_KEY = 'decentralabs-query-cache'
export const PERSISTED_QUERY_CACHE_BUSTER = process.env.NEXT_PUBLIC_RELEASE_ID
  ? `marketplace-public-cache-${process.env.NEXT_PUBLIC_RELEASE_ID}`
  : 'marketplace-public-cache-v1'

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : null,
  key: PERSISTED_QUERY_CACHE_KEY,
  serialize: serializeWithBigIntSupport,
  deserialize: JSON.parse,
});

export function clearPersistedQueryCache() {
  try {
    persister.removeClient?.()
  } catch (error) {
    devLog.warn('Unable to remove persisted public query cache:', error)
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(PERSISTED_QUERY_CACHE_KEY)
  }
}

export function shouldPersistPublicQuery(query) {
  if (!query || !Array.isArray(query.queryKey) || query.queryKey.length === 0) {
    return false
  }

  const queryType = query.queryKey[0]
  const state = query.state
  return (
    (queryType === 'labs' || queryType === 'metadata') &&
    state?.status === 'success' &&
    typeof state.data !== 'undefined'
  )
}

// Track logged query types to avoid spam and initialization state
const loggedQueryTypes = new Set();
let isInitialized = false;

/**
 * React Query provider with optimized default configuration and persistence
 * Configures global React Query settings for caching, retries, refetching, and localStorage persistence
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with React Query context
 * @returns {JSX.Element} PersistQueryClient provider with development tools
 */
export default function ClientQueryProvider({ children }) {
  
  // Initialize essential empty caches on app startup (no API calls)
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitialized) return;
    
    const initializeEssentialCaches = () => {
      try {
        devLog.log('🏗️ Checking existing cache state on app startup...');
        
        // Check if we have existing labs data in cache
        const allLabsKey = labQueryKeys.getAllLabs(); // Use the actual query key from useAllLabs
        const existingLabsData = globalQueryClient.getQueryData(allLabsKey);
        
        if (existingLabsData && existingLabsData.length > 0) {
          devLog.log('📦 Found existing all-labs cache with', existingLabsData.length, 'entries');
        } else {
          devLog.log('📦 Memory cache empty on startup - React Query will restore from localStorage or API');
        }
        
        isInitialized = true;
        devLog.log('✅ Cache state check completed');
      } catch (error) {
        devLog.warn('⚠️ Failed to check cache state:', error.message);
        // Don't throw - app should continue working even if this fails
      }
    };
    
    // Run synchronously - no API calls, so no delay needed
    initializeEssentialCaches();
  }, []);

  return (
      <PersistQueryClientProvider 
        client={globalQueryClient} 
        persistOptions={{ 
          persister,
          maxAge: 72 * 60 * 60 * 1000, // 72 hours max age in localStorage
          buster: PERSISTED_QUERY_CACHE_BUSTER,
          dehydrateOptions: {
            // Only persist these query types
            shouldDehydrateQuery: (query) => {
              // Safety check - ensure query and queryKey exist
              if (!query || !query.queryKey || !Array.isArray(query.queryKey) || query.queryKey.length === 0) {
                devLog.warn('🚫 shouldDehydrateQuery: Invalid query structure:', query);
                return false;
              }
              
              // Persist only anonymous catalogue data.
              const queryType = query.queryKey[0];
              const shouldPersist = shouldPersistPublicQuery(query);
              
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
                // Only log in development to reduce production noise
                if (process.env.NODE_ENV === 'development') {
                  devLog.log(`💾 Persisting query type: ${queryType}`);
                }
              }
              
              return shouldPersist;
            },
          },
        }}
      >
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </PersistQueryClientProvider>
    ); 
}

ClientQueryProvider.propTypes = {
  children: PropTypes.node.isRequired
}
