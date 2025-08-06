/**
 * React Query Hooks for Lab-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useWalletClient } from 'wagmi'
import { labServices } from '@/services/lab/labServices'
import { useUser } from '@/context/UserContext'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// === SIMPLE HOOKS WITH COMPOSED SERVICES ===

/**
 * Hook to get all labs with complete details using composed service
 * This is the primary data source that uses a single HTTP request
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all composed lab data
 */
export const useAllLabsQuery = (options = {}) => {
  return useQuery({
    queryKey: ['labs', 'all-composed'],
    queryFn: () => labServices.fetchAllLabsComposed(),
    staleTime: 60 * 60 * 1000, // 60 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

// === CACHE-EXTRACTING HOOKS (simple data operations) ===





// === ATOMIC HOOKS (for specific use cases when individual data is needed) ===



// === CACHE MANAGEMENT ===



// === MUTATIONS ===

/**
 * Hook to create a new lab (using authentication-aware routing)
 */
export const useCreateLabMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  const { data: walletClient } = useWalletClient();
  const { address: userAddress, isSSO, user } = useUser();
  const { contractWriteFunction: addLab } = useContractWriteFunction('addLab');
  
  return useMutation({
    mutationFn: async (labData) => {
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: addLab,
        userAddress,
        userEmail: user?.email
      };

      // Use unified service with authentication-aware routing
      return await labServices.createLab(labData, authContext);
    },
    onSuccess: (createdLab, labData) => {
      // Try granular cache update first
      try {
        const labToAdd = {
          ...createdLab,
          ...labData,
          timestamp: new Date().toISOString()
        };
        labCacheUpdates.addLabToAllLabsCache(labToAdd);
        devLog.log('✅ Lab creation: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab creation update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to create lab:', error);
    },
  });
};

/**
 * Hook to update a lab (using authentication-aware routing)
 */
export const useUpdateLabMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  const { data: walletClient } = useWalletClient();
  const { address: userAddress, isSSO, user } = useUser();
  const { contractWriteFunction: updateLab } = useContractWriteFunction('updateLab');
  
  return useMutation({
    mutationFn: async ({ labId, labData }) => {
      // Prepare update data
      const updateData = {
        labId,
        ...labData
      };
      
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: updateLab,
        userAddress,
        userEmail: user?.email
      };

      // Use unified service with authentication-aware routing
      return await labServices.updateLab(updateData, authContext);
    },
    onSuccess: (updatedLab, variables) => {
      // Try granular cache update first
      try {
        const labUpdates = {
          ...updatedLab,
          ...variables.labData,
          timestamp: new Date().toISOString()
        };
        labCacheUpdates.updateLabInAllLabsCache(variables.labId, labUpdates);
        devLog.log('✅ Lab update: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to update lab:', error);
    },
  });
};

/**
 * Hook to delete a lab (using authentication-aware routing)
 */
export const useDeleteLabMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  const { data: walletClient } = useWalletClient();
  const { address: userAddress, isSSO, user } = useUser();
  const { contractWriteFunction: deleteLab } = useContractWriteFunction('deleteLab');
  
  return useMutation({
    mutationFn: async (labId) => {
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: deleteLab,
        userAddress,
        userEmail: user?.email
      };

      // Use unified service with authentication-aware routing
      return await labServices.deleteLab(labId, authContext);
    },
    onSuccess: (data, labId) => {
      // Try granular cache update first
      try {
        labCacheUpdates.removeLabFromAllLabsCache(labId);
        devLog.log('✅ Lab deletion: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab deletion update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to delete lab:', error);
    },
  });
};

/**
 * Hook to toggle lab status (enable/disable) (using authentication-aware routing)
 */
export const useToggleLabStatusMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  const { data: walletClient } = useWalletClient();
  const { address: userAddress, isSSO, user } = useUser();
  // Get appropriate contract function based on operation
  const { contractWriteFunction: listLab } = useContractWriteFunction('listLab');
  const { contractWriteFunction: unlistLab } = useContractWriteFunction('unlistLab');
  
  return useMutation({
    mutationFn: async ({ labId, isListed }) => {
      // Choose correct contract function based on operation
      const contractFunction = isListed ? listLab : unlistLab;
      
      // Create authentication context
      const authContext = {
        isSSO,
        contractWriteFunction: contractFunction,
        userAddress,
        userEmail: user?.email
      };

      // Use unified service with authentication-aware routing
      return await labServices.toggleLabStatus({ labId, isListed }, authContext);
    },
    onSuccess: (data, variables) => {
      // Try granular cache update first
      try {
        const statusUpdate = {
          isListed: variables.isListed,
          timestamp: new Date().toISOString()
        };
        labCacheUpdates.updateLabInAllLabsCache(variables.labId, statusUpdate);
        devLog.log('✅ Lab status toggle: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab status update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to toggle lab status:', error);
    },
  });
};

// ===============================
// === GRANULAR CACHE UPDATES FOR LABS ===
// ===============================

/**
 * Hook for lab-specific granular cache updates
 * @returns {Object} Lab cache update functions
 */
export const useLabCacheUpdates = () => {
  const queryClient = useQueryClient();

  /**
   * Update lab data in all labs cache without refetching everything
   * @param {string|number} labId - Lab ID
   * @param {Object} updates - Partial lab data updates
   */
  const updateLabInAllLabsCache = (labId, updates) => {
    if (!labId || !updates) return;

    // Update in composed labs cache (if it exists)
    const allLabsKey = ['labs', 'all-composed'];
    const currentLabsData = queryClient.getQueryData(allLabsKey);
    
    if (currentLabsData && Array.isArray(currentLabsData)) {
      const updatedLabs = currentLabsData.map(lab => 
        lab.id === labId ? { ...lab, ...updates } : lab
      );
      queryClient.setQueryData(allLabsKey, updatedLabs);
      devLog.log('🎯 Updated lab in all labs cache:', { labId, updates });
    }

    // Also update individual lab cache
    const labDataKey = QUERY_KEYS.LABS.data(labId);
    const currentLabData = queryClient.getQueryData(labDataKey);
    
    if (currentLabData) {
      queryClient.setQueryData(labDataKey, { ...currentLabData, ...updates });
      devLog.log('🎯 Updated individual lab cache:', { labId, updates });
    }
  };

  /**
   * Add a new lab to all labs cache without refetching everything
   * @param {Object} newLab - New lab data
   */
  const addLabToAllLabsCache = (newLab) => {
    if (!newLab || !newLab.id) return;

    const allLabsKey = ['labs', 'all-composed'];
    const currentLabsData = queryClient.getQueryData(allLabsKey);
    
    if (currentLabsData && Array.isArray(currentLabsData)) {
      queryClient.setQueryData(allLabsKey, [...currentLabsData, newLab]);
      devLog.log('🎯 Added lab to all labs cache:', { labId: newLab.id });
    }
  };

  /**
   * Remove a lab from all labs cache without refetching everything
   * @param {string|number} labId - Lab ID to remove
   */
  const removeLabFromAllLabsCache = (labId) => {
    if (!labId) return;

    const allLabsKey = ['labs', 'all-composed'];
    const currentLabsData = queryClient.getQueryData(allLabsKey);
    
    if (currentLabsData && Array.isArray(currentLabsData)) {
      const updatedLabs = currentLabsData.filter(lab => lab.id !== labId);
      queryClient.setQueryData(allLabsKey, updatedLabs);
      devLog.log('🎯 Removed lab from all labs cache:', { labId });
    }

    // Also remove individual lab cache
    queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
  };

  /**
   * Smart lab invalidation - tries granular first, falls back to invalidation
   * @param {string|number} labId - Lab ID
   * @param {Object} [labData] - Lab data for granular updates
   * @param {string} [action] - Action type: 'add', 'remove', 'update'
   */
  const smartLabInvalidation = (labId, labData = null, action = null) => {
    // Try granular updates first if we have the data and action
    if (labData && action) {
      try {
        switch (action) {
          case 'add':
            addLabToAllLabsCache(labData);
            return; // Success, no need for invalidation
          case 'remove':
            removeLabFromAllLabsCache(labId);
            return; // Success, no need for invalidation
          case 'update':
            updateLabInAllLabsCache(labId, labData);
            return; // Success, no need for invalidation
        }
      } catch (error) {
        devLog.warn('⚠️ Granular lab update failed, falling back to invalidation:', error);
      }
    }

    // Fallback to traditional invalidation
    if (labId) {
      // Lab data
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.LABS.data(labId)
      });
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.LABS.owner(labId)
      });
      
      // Lab list (for new/deleted labs)
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.LABS.list
      });
      
      devLog.log('🔄 Used fallback invalidation for lab data:', labId);
    }
  };

  return {
    updateLabInAllLabsCache,
    addLabToAllLabsCache,
    removeLabFromAllLabsCache,
    smartLabInvalidation
  };
};
