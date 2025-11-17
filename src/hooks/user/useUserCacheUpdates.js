/**
 * User cache updates utilities for granular cache management
 * Used by user event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { userQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import { useIsLabProviderSSO } from './useUserAtomicQueries'
import devLog from '@/utils/dev/logger'

/**
 * Hook providing user-specific cache update functions
 * @returns {Object} Cache update functions for users
 * @returns {Function} returns.refreshProviderStatus - Refresh provider status from blockchain
 * @returns {Function} returns.clearSSOSession - Clear SSO session from cache
 * @returns {Function} returns.addProvider - Add new provider to cache
 * @returns {Function} returns.updateProvider - Update existing provider in cache
 * @returns {Function} returns.removeProvider - Remove provider from cache
 * @returns {Function} returns.updateUser - Update user data in cache
 * @returns {Function} returns.invalidateAllUsers - Invalidate all user queries
 * @returns {Function} returns.invalidateAllProviders - Invalidate all provider queries
 */
export function useUserCacheUpdates() {
  const queryClient = useQueryClient()

  /**
   * Refresh provider status from blockchain and update cache
   * This is a cache utility that fetches fresh data without using useMutation
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} Provider status data
   */
  const refreshProviderStatus = useCallback(async (userAddress) => {
    if (!userAddress) {
      throw new Error('userAddress is required')
    }

    try {
      // Fetch fresh provider status using the atomic query's queryFn
      const data = await useIsLabProviderSSO.queryFn({ userAddress })
      
      // Update cache with fresh data
      queryClient.setQueryData(
        providerQueryKeys.isLabProvider(userAddress),
        {
          isLabProvider: data.isLabProvider,
          isProvider: data.isLabProvider // Alias for backward compatibility
        }
      )
      
      devLog.success('Provider status refreshed successfully for', userAddress)
      return {
        isLabProvider: data.isLabProvider,
        isProvider: data.isLabProvider,
        address: userAddress
      }
    } catch (error) {
      devLog.error('Failed to refresh provider status for', userAddress, ':', error.message)
      throw error
    }
  }, [queryClient])

  /**
   * Clear SSO session from cache
   * Used during logout to ensure clean state
   */
  const clearSSOSession = useCallback(() => {
    // Cancel any ongoing SSO queries
    queryClient.cancelQueries({ queryKey: userQueryKeys.ssoSession() })
    
    // Set empty session data
    queryClient.setQueryData(userQueryKeys.ssoSession(), {
      user: null,
      isSSO: false
    })
    
    // Remove SSO queries from cache
    queryClient.removeQueries({ queryKey: userQueryKeys.ssoSession() })
    queryClient.removeQueries({ queryKey: userQueryKeys.all() })
    
    devLog.log('🧹 SSO session cleared from cache')
  }, [queryClient])

  // Add new provider to cache
  const addProvider = useCallback((newProvider) => {
    // Update providers list
    queryClient.setQueryData(providerQueryKeys.list(), (oldData) => {
      if (!oldData) return [newProvider]
      return [newProvider, ...oldData]
    })

    // Update specific provider status if we have address
    if (newProvider.address || newProvider.account) {
      const address = newProvider.address || newProvider.account;
      queryClient.setQueryData(providerQueryKeys.byAddress(address), newProvider)
      queryClient.setQueryData(
        providerQueryKeys.isLabProvider(address),
        { isLabProvider: true, isProvider: true }
      )
    }
  }, [queryClient])

  // Update existing provider in cache
  const updateProvider = useCallback((providerAddress, updatedProvider) => {
    // Update providers list
    queryClient.setQueryData(providerQueryKeys.list(), (oldData) => {
      if (!oldData) return []
      return oldData.map(provider => 
        (provider.address === providerAddress || provider.account === providerAddress) 
          ? { ...provider, ...updatedProvider } 
          : provider
      )
    })

    // Update specific provider queries
    queryClient.setQueryData(providerQueryKeys.byAddress(providerAddress), (oldData) => {
      if (!oldData) return updatedProvider;
      return { ...oldData, ...updatedProvider };
    })
  }, [queryClient])

  // Remove provider from cache
  const removeProvider = useCallback((providerAddress) => {
    // Update providers list
    queryClient.setQueryData(providerQueryKeys.list(), (oldData) => {
      if (!oldData) return []
      return oldData.filter(provider => 
        provider.address !== providerAddress && provider.account !== providerAddress
      )
    })

    // Invalidate specific provider query
    queryClient.invalidateQueries({
      queryKey: providerQueryKeys.byAddress(providerAddress)
    })
  }, [queryClient])

  // Update user data in cache
  const updateUser = useCallback((userAddress, updatedUser) => {
    // Update specific user query
    queryClient.setQueryData(userQueryKeys.byAddress(userAddress), (oldData) => {
      if (!oldData) return updatedUser;
      return { ...oldData, ...updatedUser };
    })
  }, [queryClient])

  // Invalidate all user caches (fallback)
  const invalidateAllUsers = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: userQueryKeys.all()
    })
  }, [queryClient])

  // Invalidate all provider caches (fallback)
  const invalidateAllProviders = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: providerQueryKeys.all()
    })
  }, [queryClient])

  // Add optimistic provider (for immediate UI feedback)
  const addOptimisticProvider = useCallback((providerData) => {
    const optimisticProvider = {
      ...providerData,
      id: `temp-${Date.now()}`,
      isPending: true,
      isProcessing: true,
      timestamp: new Date().toISOString()
    }

    addProvider(optimisticProvider)
    return optimisticProvider
  }, [addProvider])

  // Replace optimistic provider with real data
  const replaceOptimisticProvider = useCallback((optimisticId, realProvider) => {
    queryClient.setQueryData(providerQueryKeys.list(), (oldData) => {
      if (!oldData) return [realProvider]
      return oldData.map(provider => 
        provider.id === optimisticId ? realProvider : provider
      )
    })

    // Update specific provider status if we have real address
    if (realProvider.address || realProvider.account) {
      const address = realProvider.address || realProvider.account;
      queryClient.setQueryData(providerQueryKeys.byAddress(address), realProvider)
    }
  }, [queryClient])

  // Remove optimistic provider (on error)
  const removeOptimisticProvider = useCallback((optimisticId) => {
    queryClient.setQueryData(providerQueryKeys.list(), (oldData) => {
      if (!oldData) return []
      return oldData.filter(provider => provider.id !== optimisticId)
    })
  }, [queryClient])

  return {
    // Provider status operations
    refreshProviderStatus,
    
    // SSO operations
    clearSSOSession,
    
    // Basic operations
    addProvider,
    updateProvider,
    removeProvider,
    updateUser,
    invalidateAllUsers,
    invalidateAllProviders,
    
    // Optimistic operations
    addOptimisticProvider,
    replaceOptimisticProvider,
    removeOptimisticProvider
  }
}
