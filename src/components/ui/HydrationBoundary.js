/**
 * Enhanced HydrationBoundary component with error handling and development insights
 * Provides graceful fallback when prefetched data is unavailable
 * Includes development logging for SSR debugging
 */
"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { HydrationBoundary as ReactQueryHydrationBoundary } from '@tanstack/react-query'
import devLog from '@/utils/dev/logger'

/**
 * Custom HydrationBoundary wrapper that handles empty states gracefully
 * @param {Object} props
 * @param {Object} props.state - Dehydrated React Query state from server
 * @param {React.ReactNode} props.children - Child components to hydrate
 * @param {boolean} [props.logHydration=false] - Whether to log hydration details in development
 * @returns {JSX.Element} HydrationBoundary wrapper with error handling
 */
function HydrationBoundary({ state, children, logHydration = false }) {
  
  // Log hydration details in development
  React.useEffect(() => {
    if (logHydration && process.env.NODE_ENV === 'development') {
      const queryCount = state?.queries?.length || 0
      const mutationCount = state?.mutations?.length || 0
      
      if (queryCount > 0 || mutationCount > 0) {
        devLog.log(`🚀 [Hydration] Successfully hydrated with ${queryCount} queries and ${mutationCount} mutations`)
        
        // Log query keys for debugging
        if (state?.queries?.length > 0) {
          const queryKeys = state.queries.map(query => query.queryKey).slice(0, 3) // Show first 3
          devLog.log('📋 [Hydration] Query keys:', queryKeys)
        }
      } else {
        devLog.warn('⚠️ [Hydration] No queries or mutations in dehydrated state - falling back to client-side fetching')
      }
    }
  }, [state, logHydration])

  // If no state provided, just render children (fallback to client-side fetching)
  if (!state) {
    if (process.env.NODE_ENV === 'development') {
      devLog.warn('⚠️ [Hydration] No dehydrated state provided - components will use client-side fetching')
    }
    return <>{children}</>
  }

  // If empty state, also just render children
  const hasQueries = state?.queries && state.queries.length > 0
  const hasMutations = state?.mutations && state.mutations.length > 0
  
  if (!hasQueries && !hasMutations) {
    if (process.env.NODE_ENV === 'development') {
      devLog.warn('⚠️ [Hydration] Empty dehydrated state - components will use client-side fetching')
    }
    return <>{children}</>
  }

  // Use React Query's HydrationBoundary with provided state
  return (
    <ReactQueryHydrationBoundary state={state}>
      {children}
    </ReactQueryHydrationBoundary>
  )
}

HydrationBoundary.propTypes = {
  /** Dehydrated React Query state from server prefetch */
  state: PropTypes.object,
  /** Child components to wrap with hydration boundary */
  children: PropTypes.node.isRequired,
  /** Whether to log hydration details in development (default: false) */
  logHydration: PropTypes.bool,
}

export default HydrationBoundary

/**
 * Enhanced HydrationBoundary with logging enabled by default
 * Useful for debugging SSR hydration in development
 * @param {Object} props - Same props as HydrationBoundary
 * @returns {JSX.Element} HydrationBoundary with logging enabled
 */
export function HydrationBoundaryWithLogging(props) {
  return <HydrationBoundary {...props} logHydration={true} />
}

/**
 * Hook to check if we're in a hydrated state
 * Useful for components that need to know if they have server-prefetched data
 * @returns {boolean} True if component is hydrated with server data
 */
export function useIsHydrated() {
  const [isHydrated, setIsHydrated] = React.useState(false)
  
  React.useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  return isHydrated
}

/**
 * Higher-order component that only renders children after hydration
 * Useful for preventing hydration mismatches in specific components
 * @param {React.ComponentType} Component - Component to wrap
 * @returns {React.ComponentType} Wrapped component that only renders after hydration
 */
export function withHydrationGuard(Component) {
  const WrappedComponent = (props) => {
    const isHydrated = useIsHydrated()
    
    if (!isHydrated) {
      return null // Or a loading placeholder
    }
    
    return <Component {...props} />
  }
  
  WrappedComponent.displayName = `withHydrationGuard(${Component.displayName || Component.name})`
  
  return WrappedComponent
}
