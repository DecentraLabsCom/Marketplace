/**
 * User cache updates utilities for granular cache management
 * Used by user event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { userQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'

/**
 * Hook providing user-specific cache update functions
 * @returns {Object} Cache update functions for users
 */
export function useUserCacheUpdates() {
  const queryClient = useQueryClient()

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
