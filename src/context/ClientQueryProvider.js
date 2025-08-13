"use client";
import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { labQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

const queryClient = new QueryClient({
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

// Create persister for localStorage
const persister = createAsyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : null,
  key: 'decentralabs-query-cache',
  throttleTime: 5000, // Save to storage every 5 seconds (reduced frequency)
  serialize: JSON.stringify,
  deserialize: JSON.parse,
  // Only persist specific query types to avoid storing too much
  retry: removeOldestQuery => {
    removeOldestQuery()
  },
});

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
        const allLabsKey = ['labs', 'getAllLabs']; // Use the actual query key from useAllLabs
        const existingLabsData = queryClient.getQueryData(allLabsKey);
        
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
        client={queryClient} 
        persistOptions={{ 
          persister,
          maxAge: 72 * 60 * 60 * 1000, // 72 hours max age in localStorage
          buster: '', // Add version string if you want to bust cache on app updates
          dehydrateOptions: {
            // Only persist these query types
            shouldDehydrateQuery: (query) => {
              // Safety check - ensure query and queryKey exist
              if (!query || !query.queryKey || !Array.isArray(query.queryKey) || query.queryKey.length === 0) {
                devLog.warn('🚫 shouldDehydrateQuery: Invalid query structure:', query);
                return false;
              }
              
              // Persist lab, provider, and user queries
              const queryType = query.queryKey[0];
              // Persist key families we want across reloads
              // - labs: catalog and metadata
              // - provider: single-provider details
              // - providers: provider lists
              // - reservations: on-chain reservation data per user/lab
              // - bookings: client-side composed booking aggregates
              // - auth: sso session
              // - labImage: cached lab images (base64 data)
              // - metadata: lab metadata including image URLs
              const shouldPersist = (
                queryType === 'labs' ||
                queryType === 'provider' ||
                queryType === 'providers' ||
                queryType === 'reservations' ||
                queryType === 'bookings' ||
                queryType === 'auth' ||
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