/**
 * User cache updates utilities for granular cache management
 * Used by user event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { userQueryKeys } from '@/utils/hooks/queryKeys'

/**
 * Hook providing user-specific cache update functions
 * @returns {Object} Cache update functions for users
 */
export function useUserCacheUpdates() {
  const queryClient = useQueryClient()

  // Update user data in cache
  const updateUser = useCallback((userAddress, updatedUser) => {
    // Update specific user query
    queryClient.setQueryData(userQueryKeys.byAddress(userAddress), updatedUser)

    // Update provider status if available (use same query key as useIsLabProvider)
    if (updatedUser.isProvider !== undefined) {
      queryClient.setQueryData(
        ['providers', 'isLabProvider', userAddress], 
        { isLabProvider: updatedUser.isProvider, isProvider: updatedUser.isProvider }
      )
    }
  }, [queryClient])

  // Update provider status (use same query key as useIsLabProvider)
  const updateProviderStatus = useCallback((userAddress, isProvider) => {
    queryClient.setQueryData(
      ['providers', 'isLabProvider', userAddress], 
      { isLabProvider: isProvider, isProvider: isProvider }
    )

    // Also update user data if cached
    queryClient.setQueryData(
      userQueryKeys.byAddress(userAddress), 
      (oldData) => {
        if (!oldData) return oldData
        return { ...oldData, isProvider }
      }
    )
  }, [queryClient])

  // Update SSO session
  const updateSSOSession = useCallback((sessionData) => {
    queryClient.setQueryData(userQueryKeys.ssoSession(), sessionData)
  }, [queryClient])

  // Invalidate user caches (fallback)
  const invalidateUserQueries = useCallback((userAddress) => {
    if (userAddress) {
      queryClient.invalidateQueries({
        queryKey: userQueryKeys.byAddress(userAddress)
      })
      queryClient.invalidateQueries({
        queryKey: ['providers', 'isLabProvider', userAddress] // Use same query key as useIsLabProvider
      })
    } else {
      queryClient.invalidateQueries({
        queryKey: userQueryKeys.all()
      })
    }
  }, [queryClient])

  return {
    updateUser,
    updateProviderStatus,
    updateSSOSession,
    invalidateUserQueries
  }
}
