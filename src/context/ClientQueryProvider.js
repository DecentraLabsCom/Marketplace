"use client"; 
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; 
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default cache time (5 minutes)
      staleTime: 5 * 60 * 1000,
      // Time before garbage collection (12 hours like labs)
      gcTime: 12 * 60 * 60 * 1000,
      // Retry on error
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on focus
      refetchOnWindowFocus: true,
      // Refetch when reconnecting
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry on error for mutations
      retry: 1,
    },
  },
});

export default function ClientQueryProvider({ children }) { 
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    ); 
}