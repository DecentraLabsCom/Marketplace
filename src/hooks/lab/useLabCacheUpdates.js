/**
 * Lab cache updates utilities for granular cache management
 * Used by lab event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import { enqueueReconciliationEntry, removeReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'
import devLog from '@/utils/dev/logger'

/**
 * Hook providing lab-specific cache update functions
 * @returns {Object} Cache update functions for labs
 * @returns {Function} returns.addLab - Add new lab to cache function
 * @returns {Function} returns.updateLab - Update existing lab in cache function
 * @returns {Function} returns.removeLab - Remove lab from cache function
 * @returns {Function} returns.invalidateAllLabs - Invalidate all lab queries function
 * @returns {Function} returns.invalidateLabById - Invalidate specific lab query function
 */
export function useLabCacheUpdates() {
  const queryClient = useQueryClient()

  // Add new lab to cache
  const addLab = useCallback((newLab) => {
    // Update all labs list
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!oldData) return [newLab]
      return [newLab, ...oldData]
    })

    // Update specific lab query
    if (newLab.labId || newLab.id) {
      const labId = newLab.labId || newLab.id;
      queryClient.setQueryData(labQueryKeys.getLab(labId), newLab)
    }
  }, [queryClient])

  // Update existing lab in cache
  const updateLab = useCallback((labId, updatedLab) => {
    const onchainKeys = ['uri', 'price', 'accessURI', 'accessKey', 'tokenURI', 'createdAt'];
    const collectOnchainUpdates = (source) => {
      if (!source || typeof source !== 'object') return {};
      const baseSource = source.base && typeof source.base === 'object' ? source.base : {};
      return onchainKeys.reduce((acc, key) => {
        if (source[key] !== undefined) {
          acc[key] = source[key];
        } else if (baseSource[key] !== undefined) {
          acc[key] = baseSource[key];
        }
        return acc;
      }, {});
    };
    const onchainUpdates = collectOnchainUpdates(updatedLab);

    // Update all labs list (using correct query key)
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!oldData) {
        devLog.log('⚠️ No existing lab data found in cache');
        return []
      }
      const updated = oldData.map((lab) => {
        if (lab.labId !== labId && lab.id !== labId) return lab;
        return { ...lab, ...updatedLab, ...onchainUpdates };
      });
      devLog.log('🔄 Updated all labs cache:', { count: updated.length });
      return updated;
    })

    // Update specific lab query
    queryClient.setQueryData(labQueryKeys.getLab(labId), (oldData) => {
      if (!oldData) {
        devLog.log('⚠️ No existing specific lab data found for ID:', labId);
        if (Object.keys(onchainUpdates).length > 0) {
          return { ...updatedLab, base: { ...onchainUpdates } };
        }
        return updatedLab;
      }
      const nextBase = Object.keys(onchainUpdates).length > 0
        ? { ...(oldData.base || {}), ...onchainUpdates }
        : oldData.base;
      const result = nextBase
        ? { ...oldData, ...updatedLab, base: nextBase }
        : { ...oldData, ...updatedLab };
      devLog.log('🔄 Updated specific lab cache:', { labId, result });
      return result;
    })
  }, [queryClient])

  // Remove lab from cache
  const removeLab = useCallback((labId) => {
    // Update all labs list
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!oldData) return []
      return oldData.filter(lab => lab.labId !== labId && lab.id !== labId)
    })

    // Invalidate specific lab query
    queryClient.invalidateQueries({
      queryKey: labQueryKeys.getLab(labId)
    })
  }, [queryClient])

  // Add optimistic lab (for immediate UI feedback)
  const addOptimisticLab = useCallback((labData) => {
    const optimisticLab = {
      ...labData,
      id: `temp-${Date.now()}`,
      labId: `temp-${Date.now()}`,
      isPending: true,
      isProcessing: true,
      timestamp: new Date().toISOString()
    };

    addLab(optimisticLab);
    enqueueReconciliationEntry({
      id: `lab:add:${optimisticLab.id}`,
      category: 'lab-add',
      queryKeys: [
        labQueryKeys.getAllLabs(),
      ],
    });
    return optimisticLab;
  }, [addLab])

  // Replace optimistic lab with real data
  const replaceOptimisticLab = useCallback((optimisticId, realLab) => {
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!oldData) return [realLab];
      return oldData.map(lab => 
        lab.id === optimisticId ? realLab : lab
      );
    });

    // Update specific lab query if we have real ID
    if (realLab.labId || realLab.id) {
      const labId = realLab.labId || realLab.id;
      queryClient.setQueryData(labQueryKeys.getLab(labId), realLab);
    }
    removeReconciliationEntry(`lab:add:${optimisticId}`);
  }, [queryClient])

  // Remove optimistic lab (on error)
  const removeOptimisticLab = useCallback((optimisticId) => {
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!oldData) return [];
      return oldData.filter(lab => lab.id !== optimisticId);
    });
    removeReconciliationEntry(`lab:add:${optimisticId}`);
  }, [queryClient])

  // Invalidate all lab caches (fallback)
  const invalidateAllLabs = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: labQueryKeys.getAllLabs()
    })
  }, [queryClient])

  return {
    // Basic operations
    addLab,
    updateLab,
    removeLab,
    invalidateAllLabs,
    
    // Optimistic operations (kept - these are actively used)
    addOptimisticLab,
    replaceOptimisticLab,
    removeOptimisticLab
  }
}
