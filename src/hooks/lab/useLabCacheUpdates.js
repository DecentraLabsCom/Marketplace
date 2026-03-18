/**
 * Lab cache updates utilities for granular cache management
 * Used by lab event contexts and optimistic updates
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import { enqueueReconciliationEntry, removeReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'
import devLog from '@/utils/dev/logger'

const normalizeLabId = (value) => {
  if (value === undefined || value === null) return null;
  return String(value);
};

const extractLabId = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    return value.labId ?? value.id ?? value.tokenId ?? null;
  }
  return value;
};

const toCachedLabId = (value) => {
  const rawId = extractLabId(value);
  if (rawId === undefined || rawId === null) return null;
  if (typeof rawId === 'bigint') return Number(rawId);
  if (typeof rawId === 'number') return Number.isFinite(rawId) ? rawId : null;
  if (typeof rawId === 'string') {
    const trimmed = rawId.trim();
    if (!trimmed) return null;
    const numericId = Number(trimmed);
    return Number.isNaN(numericId) ? trimmed : numericId;
  }
  return null;
};

const normalizeLabIdList = (entries) => {
  if (!Array.isArray(entries)) return [];

  const seen = new Set();
  const normalized = [];

  entries.forEach((entry) => {
    const labId = toCachedLabId(entry);
    const key = normalizeLabId(labId);
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(labId);
  });

  return normalized;
};

const buildLabIdCandidates = (labId) => {
  const candidates = new Set();
  if (labId === undefined || labId === null) {
    return [];
  }

  candidates.add(labId);
  candidates.add(String(labId));

  const numericId = Number(labId);
  if (!Number.isNaN(numericId)) {
    candidates.add(numericId);
  }

  return Array.from(candidates);
};

const hasSameLabId = (lab, targetLabId) => {
  const target = normalizeLabId(targetLabId);
  if (!target) return false;

  const candidate = lab?.labId ?? lab?.id ?? lab;
  return normalizeLabId(candidate) === target;
};

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
    const newLabId = toCachedLabId(newLab);

    // Update all labs list
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      const normalizedIds = normalizeLabIdList(oldData);
      if (newLabId === null) return normalizedIds;
      if (normalizedIds.some((labId) => hasSameLabId(labId, newLabId))) {
        return normalizedIds;
      }
      return [newLabId, ...normalizedIds]
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

    // Maintain getAllLabs as a canonical lab-id list only.
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      if (!oldData) {
        devLog.log('⚠️ No existing lab data found in cache');
        return []
      }
      const normalizedIds = normalizeLabIdList(oldData);
      devLog.log('🔄 Preserved all labs id cache:', { count: normalizedIds.length });
      return normalizedIds;
    })

    // Update specific lab query
    const candidateIds = buildLabIdCandidates(labId);
    candidateIds.forEach((candidateId) => {
      queryClient.setQueryData(labQueryKeys.getLab(candidateId), (oldData) => {
        if (!oldData) {
          devLog.log('⚠️ No existing specific lab data found for ID:', candidateId);
          // When there's no existing specific cache, return the updates directly.
          // This preserves the expected plain shape (e.g., { price: 150 }) and avoids
          // introducing a nested `base` object unexpectedly in newly created entries.
          return updatedLab;
        }
        const nextBase = Object.keys(onchainUpdates).length > 0
          ? { ...(oldData.base || {}), ...onchainUpdates }
          : oldData.base;
        const result = nextBase
          ? { ...oldData, ...updatedLab, base: nextBase }
          : { ...oldData, ...updatedLab };
        devLog.log('🔄 Updated specific lab cache:', { labId: candidateId, result });
        return result;
      })
    });
  }, [queryClient])

  // Remove lab from cache
  const removeLab = useCallback((labId) => {
    // Update all labs list
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
      const normalizedIds = normalizeLabIdList(oldData)
      return normalizedIds.filter((cachedLabId) => !hasSameLabId(cachedLabId, labId))
    })

    // Invalidate specific lab query across common key variants
    const candidateIds = buildLabIdCandidates(labId);
    candidateIds.forEach((candidateId) => {
      queryClient.invalidateQueries({
        queryKey: labQueryKeys.getLab(candidateId),
        exact: true,
      })
    });
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
      const normalizedIds = normalizeLabIdList(oldData);
      const realLabId = toCachedLabId(realLab);
      const replaced = normalizedIds.map((labId) =>
        hasSameLabId(labId, optimisticId) ? realLabId : labId
      );
      return normalizeLabIdList(replaced);
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
      const normalizedIds = normalizeLabIdList(oldData);
      return normalizedIds.filter((labId) => !hasSameLabId(labId, optimisticId));
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
