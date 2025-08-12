/**
 * Lab cache updates utilities for granular cache management
 * Used by lab event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { labQueryKeys } from '@/utils/hooks/queryKeys'

/**
 * Hook providing lab-specific cache update functions
 * @returns {Object} Cache update functions for labs
 */
export function useLabCacheUpdates() {
  const queryClient = useQueryClient()

  // Add new lab to cache
  const addLab = useCallback((newLab) => {
    // Update all labs list
    queryClient.setQueryData(labQueryKeys.all(), (oldData) => {
      if (!oldData) return [newLab]
      return [newLab, ...oldData]
    })

    // Update specific lab query
    if (newLab.labId) {
      queryClient.setQueryData(labQueryKeys.byId(newLab.labId), newLab)
    }
  }, [queryClient])

  // Update existing lab in cache
  const updateLab = useCallback((labId, updatedLab) => {
    // Update all labs list
    queryClient.setQueryData(labQueryKeys.all(), (oldData) => {
      if (!oldData) return []
      return oldData.map(lab => 
        lab.labId === labId ? { ...lab, ...updatedLab } : lab
      )
    })

    // Update specific lab query
    queryClient.setQueryData(labQueryKeys.byId(labId), updatedLab)
  }, [queryClient])

  // Remove lab from cache
  const removeLab = useCallback((labId) => {
    // Update all labs list
    queryClient.setQueryData(labQueryKeys.all(), (oldData) => {
      if (!oldData) return []
      return oldData.filter(lab => lab.labId !== labId)
    })

    // Invalidate specific lab query
    queryClient.invalidateQueries({
      queryKey: labQueryKeys.byId(labId)
    })
  }, [queryClient])

  // Invalidate all lab caches (fallback)
  const invalidateAllLabs = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: labQueryKeys.all()
    })
  }, [queryClient])

  return {
    addLab,
    updateLab,
    removeLab,
    invalidateAllLabs
  }
}
