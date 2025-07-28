"use client";
import PropTypes from 'prop-types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default cache time (15 minutes for blockchain data)
      staleTime: 15 * 60 * 1000,
      // Time before garbage collection (12 hours like labs)
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

/**
 * React Query provider with optimized default configuration
 * Configures global React Query settings for caching, retries, and refetching
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with React Query context
 * @returns {JSX.Element} QueryClient provider with development tools
 */
export default function ClientQueryProvider({ children }) { 
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    ); 
}

ClientQueryProvider.propTypes = {
  children: PropTypes.node.isRequired
}