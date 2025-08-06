"use client";
import PropTypes from 'prop-types'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

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
  throttleTime: 1000, // Save to storage every 1 second
  serialize: JSON.stringify,
  deserialize: JSON.parse,
  // Only persist specific query types to avoid storing too much
  retry: removeOldestQuery => {
    removeOldestQuery()
  },
});

/**
 * React Query provider with optimized default configuration and persistence
 * Configures global React Query settings for caching, retries, refetching, and localStorage persistence
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with React Query context
 * @returns {JSX.Element} PersistQueryClient provider with development tools
 */
export default function ClientQueryProvider({ children }) { 
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
              // Persist lab, provider, and user queries
              return query.queryKey[0] === 'labs' || 
                     query.queryKey[0] === 'provider' || 
                     query.queryKey[0] === 'sso';
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