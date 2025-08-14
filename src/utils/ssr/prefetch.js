/**
 * Server-side prefetch utilities for SSR optimization with React Query
 * Provides functions to pre-load critical data on the server for seamless hydration
 */
import { QueryClient, dehydrate } from '@tanstack/react-query'
import { LAB_QUERY_CONFIG } from '@/hooks/lab/useLabs'
import { USER_QUERY_CONFIG } from '@/hooks/user/useUsers'
import devLog from '@/utils/dev/logger'

/**
 * Create a QueryClient optimized for server-side rendering
 * Uses conservative settings to avoid issues during SSR
 * @returns {QueryClient} Configured query client for SSR
 */
export const createSSRQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,     // 1 minute - shorter for SSR
        gcTime: 5 * 60 * 1000,    // 5 minutes - shorter for SSR
        retry: 0,                 // No retry on server to avoid timeouts
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: false, // Never retry mutations on server
      },
    },
  })
}

/**
 * Get the base URL for API calls during SSR
 * Uses environment variable or falls back to localhost for development
 * @returns {string} Base URL for server-side API calls
 */
const getServerBaseURL = () => {
  // Try multiple environment variables in order of preference
  const baseUrl = 
    process.env.NEXTAUTH_URL ||           // NextAuth canonical URL
    process.env.VERCEL_URL ||             // Vercel deployment URL
    process.env.NEXT_PUBLIC_BASE_URL ||   // Custom base URL
    'http://localhost:3000'               // Development fallback
  
  // Ensure HTTPS for production URLs
  if (baseUrl.includes('vercel.app') && !baseUrl.startsWith('https://')) {
    return `https://${baseUrl.replace(/^https?:\/\//, '')}`
  }
  
  return baseUrl
}

/**
 * Prefetch all labs data with metadata for homepage and lab listing pages
 * This is the most critical data for UX and SEO
 * @returns {Promise<Object>} Dehydrated state with prefetched labs data
 */
export const prefetchLabsData = async () => {
  const queryClient = createSSRQueryClient()
  const baseUrl = getServerBaseURL()
  
  try {
    devLog.log('🔄 [SSR] Prefetching labs data from:', baseUrl)
    
    // Prefetch all labs (most critical data)
    await queryClient.prefetchQuery({
      queryKey: ['labs', 'getAllLabs'],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/lab/getAllLabs`, {
          headers: { 'Content-Type': 'application/json' },
          // Add timeout to prevent hanging during SSR
          signal: AbortSignal.timeout(8000), // 8 second timeout
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch labs: ${response.status}`)
        }
        
        const data = await response.json()
        devLog.log('✅ [SSR] Labs data prefetched:', data?.length || 0, 'labs')
        return data
      },
      staleTime: LAB_QUERY_CONFIG.staleTime, // Use lab-specific stale time
    })

    // Prefetch lab providers (needed for enrichment)
    await queryClient.prefetchQuery({
      queryKey: ['providers', 'getLabProviders'],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/provider/getLabProviders`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.status}`)
        }
        
        const data = await response.json()
        devLog.log('✅ [SSR] Providers data prefetched:', data?.count || 0, 'providers')
        return data
      },
      staleTime: USER_QUERY_CONFIG.staleTime, // Use user-specific stale time
    })

    const dehydratedState = dehydrate(queryClient)
    devLog.log('🎉 [SSR] Successfully created dehydrated state with', Object.keys(dehydratedState.queries || {}).length, 'queries')
    
    return dehydratedState

  } catch (error) {
    devLog.error('❌ [SSR] Failed to prefetch labs data:', error.message)
    
    // Return empty dehydrated state if prefetch fails
    // This ensures the app still works but falls back to client-side fetching
    return dehydrate(queryClient)
  }
}

/**
 * Prefetch specific lab data for individual lab pages
 * Includes lab details, metadata, and owner information
 * @param {string|number} labId - Lab ID to prefetch data for
 * @returns {Promise<Object>} Dehydrated state with specific lab data
 */
export const prefetchLabDetails = async (labId) => {
  const queryClient = createSSRQueryClient()
  const baseUrl = getServerBaseURL()
  
  try {
    devLog.log(`🔄 [SSR] Prefetching lab ${labId} details from:`, baseUrl)
    
    // Prefetch specific lab details
    await queryClient.prefetchQuery({
      queryKey: ['labs', 'getLab', labId],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/lab/getLab?labId=${labId}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(6000), // 6 second timeout
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch lab ${labId}: ${response.status}`)
        }
        
        const data = await response.json()
        devLog.log(`✅ [SSR] Lab ${labId} details prefetched`)
        return data
      },
      staleTime: LAB_QUERY_CONFIG.staleTime,
    })

    // Prefetch lab owner
    await queryClient.prefetchQuery({
      queryKey: ['labs', 'ownerOf', labId],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/lab/ownerOf?labId=${labId}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch owner for lab ${labId}: ${response.status}`)
        }
        
        const data = await response.json()
        devLog.log(`✅ [SSR] Lab ${labId} owner prefetched`)
        return data
      },
      staleTime: LAB_QUERY_CONFIG.staleTime,
    })

    // Also prefetch providers for enrichment
    await queryClient.prefetchQuery({
      queryKey: ['providers', 'getLabProviders'],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/provider/getLabProviders`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.status}`)
        }
        
        return response.json()
      },
      staleTime: USER_QUERY_CONFIG.staleTime,
    })

    const dehydratedState = dehydrate(queryClient)
    devLog.log(`🎉 [SSR] Successfully prefetched lab ${labId} data`)
    
    return dehydratedState

  } catch (error) {
    devLog.error(`❌ [SSR] Failed to prefetch lab ${labId} details:`, error.message)
    
    // Return empty dehydrated state if prefetch fails
    return dehydrate(queryClient)
  }
}

/**
 * Prefetch basic data for provider dashboard
 * Includes provider status and owned labs
 * @param {string} providerAddress - Provider wallet address
 * @returns {Promise<Object>} Dehydrated state with provider data
 */
export const prefetchProviderDashboard = async (providerAddress) => {
  const queryClient = createSSRQueryClient()
  const baseUrl = getServerBaseURL()
  
  try {
    devLog.log(`🔄 [SSR] Prefetching provider ${providerAddress} dashboard from:`, baseUrl)
    
    // Prefetch all labs (needed to filter owned labs)
    await queryClient.prefetchQuery({
      queryKey: ['labs', 'getAllLabs'],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/lab/getAllLabs`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch labs: ${response.status}`)
        }
        
        return response.json()
      },
      staleTime: LAB_QUERY_CONFIG.staleTime,
    })

    // Prefetch providers list
    await queryClient.prefetchQuery({
      queryKey: ['providers', 'getLabProviders'],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/provider/getLabProviders`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.status}`)
        }
        
        return response.json()
      },
      staleTime: USER_QUERY_CONFIG.staleTime,
    })

    const dehydratedState = dehydrate(queryClient)
    devLog.log(`🎉 [SSR] Successfully prefetched provider ${providerAddress} dashboard`)
    
    return dehydratedState

  } catch (error) {
    devLog.error(`❌ [SSR] Failed to prefetch provider dashboard:`, error.message)
    
    // Return empty dehydrated state if prefetch fails
    return dehydrate(queryClient)
  }
}

/**
 * Simple prefetch for providers data only
 * Lightweight option for pages that only need provider information
 * @returns {Promise<Object>} Dehydrated state with providers data
 */
export const prefetchProvidersOnly = async () => {
  const queryClient = createSSRQueryClient()
  const baseUrl = getServerBaseURL()
  
  try {
    devLog.log('🔄 [SSR] Prefetching providers data from:', baseUrl)
    
    await queryClient.prefetchQuery({
      queryKey: ['providers', 'getLabProviders'],
      queryFn: async () => {
        const response = await fetch(`${baseUrl}/api/contract/provider/getLabProviders`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.status}`)
        }
        
        const data = await response.json()
        devLog.log('✅ [SSR] Providers data prefetched:', data?.count || 0, 'providers')
        return data
      },
      staleTime: USER_QUERY_CONFIG.staleTime,
    })

    const dehydratedState = dehydrate(queryClient)
    devLog.log('🎉 [SSR] Successfully prefetched providers data')
    
    return dehydratedState

  } catch (error) {
    devLog.error('❌ [SSR] Failed to prefetch providers data:', error.message)
    
    // Return empty dehydrated state if prefetch fails
    return dehydrate(queryClient)
  }
}

/**
 * Utility to check if we're in a server environment
 * Useful for conditional prefetching logic
 * @returns {boolean} True if running on server
 */
export const isServer = () => typeof window === 'undefined'

/**
 * Utility to safely handle prefetch errors
 * Wraps prefetch functions with error boundaries
 * @param {Function} prefetchFn - Prefetch function to wrap
 * @param {string} fallbackMessage - Message to log on failure
 * @returns {Function} Wrapped prefetch function
 */
export const safePrefetch = (prefetchFn, fallbackMessage = 'Prefetch failed') => {
  return async (...args) => {
    try {
      return await prefetchFn(...args)
    } catch (error) {
      devLog.warn(`⚠️ [SSR] ${fallbackMessage}:`, error.message)
      // Return empty dehydrated state as fallback
      const queryClient = createSSRQueryClient()
      return dehydrate(queryClient)
    }
  }
}
