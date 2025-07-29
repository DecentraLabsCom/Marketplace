"use client";
import PropTypes from 'prop-types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
      // Retry on error for mutations
      retry: 1,
    },
  },
});

// Create persister for localStorage
const persister = createAsyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : null,
  key: 'decentralabs-query-cache',
  throttleTime: 1000, // Save to storage every 1 second
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
        persistOptions={{ persister }}
      >
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </PersistQueryClientProvider>
    ); 
}

ClientQueryProvider.propTypes = {
  children: PropTypes.node.isRequired
}