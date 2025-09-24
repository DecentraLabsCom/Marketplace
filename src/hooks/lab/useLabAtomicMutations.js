/**
 * Atomic React Query Hooks for Lab-related Write Operations  
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/lab/
 * Handles mutations (create, update, delete operations)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { parseUnits } from 'viem'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { labQueryKeys, bookingQueryKeys, metadataQueryKeys } from '@/utils/hooks/queryKeys'
import { useLabCacheUpdates } from './useLabCacheUpdates'
import devLog from '@/utils/dev/logger'

// ===== MUTATIONS =====

/**
 * SSO Hook for /api/contract/lab/addLabSSO endpoint
 * Creates a new lab using server wallet (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticLab, replaceOptimisticLab, removeOptimisticLab, invalidateAllLabs } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async (labData) => {
      // Add optimistic lab to cache for immediate UI feedback
      const optimisticLab = addOptimisticLab(labData);

      try {
        devLog.log('🎯 Optimistic lab added to cache:', optimisticLab.id);

        const response = await fetch('/api/contract/lab/addLabSSO', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(labData)
        });

        if (!response.ok) {
          throw new Error(`Failed to add lab: ${response.status}`);
        }

        const data = await response.json();
        devLog.log('🔍 useAddLabSSO:', data);
        return { ...data, optimisticId: optimisticLab.id };
      } catch (error) {
        // Remove optimistic update on error
        removeOptimisticLab(optimisticLab.id);
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      // Use cache utilities for granular updates
      try {
        if (data.labId || data.id) {
          const realLabId = data.labId || data.id;
          const updatedLab = {
            ...variables,
            ...data,
            id: realLabId,
            labId: realLabId,
            isPending: false,
            isProcessing: false,
            timestamp: new Date().toISOString()
          };

          // Replace optimistic lab with real data
          replaceOptimisticLab(data.optimisticId, updatedLab);
          devLog.log('✅ Lab added successfully via SSO, cache updated granularly');
        } else {
          devLog.error('No lab ID received, falling back to invalidation');
          invalidateAllLabs();
        }
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab:', error);
    },
    ...options,
  });
};

/**
 * Wallet Hook for adding labs using wagmi
 * Creates a new lab using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticLab, replaceOptimisticLab, removeOptimisticLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: addLab } = useContractWriteFunction('addLab');

  return useMutation({
    mutationFn: async (labData) => {
      // Add optimistic lab to cache for immediate UI feedback
      const optimisticLab = addOptimisticLab(labData);

      try {
        devLog.log('🎯 Optimistic lab added to cache:', optimisticLab.id);

        // Ensure all required parameters are defined before sending to smart contract
        const uri = labData.uri || '';
        const rawPrice = labData.price || '0'; // Default to 0 if price is undefined
        
        // Price is already in correct contract units (converted in ProviderDashboardPage.js)
        // No additional conversion needed - just ensure it's a valid BigInt
        let priceInContractUnits;
        try {
          priceInContractUnits = BigInt(rawPrice.toString());
        } catch (error) {
          devLog.error('Error converting price to BigInt:', { rawPrice, error });
          // Fallback to 0 if conversion fails
          priceInContractUnits = BigInt('0');
        }
        
        const auth = labData.auth || '';
        const accessURI = labData.accessURI || '';
        const accessKey = labData.accessKey || '';
        
        const txHash = await addLab([uri, priceInContractUnits, auth, accessURI, accessKey]);
        
        devLog.log('🔍 useAddLabWallet - Transaction Hash:', txHash);
        return { hash: txHash, optimisticId: optimisticLab.id };
      } catch (error) {
        // Remove optimistic update on error
        removeOptimisticLab(optimisticLab.id);
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      // Use cache utilities for optimistic update showing transaction sent
      try {
        // Replace optimistic lab with transaction-pending version
        const transactionPendingLab = {
          ...variables,
          id: result.optimisticId,
          transactionHash: result.hash,
          isPending: true, // Still pending blockchain confirmation
          isProcessing: false, // No longer processing on client side
          timestamp: new Date().toISOString()
        };
        
        replaceOptimisticLab(result.optimisticId, transactionPendingLab);
        devLog.log('✅ Lab transaction sent via wallet, awaiting blockchain confirmation');
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for adding labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useAddLabSSO(options);
  const walletMutation = useAddLabWallet(options);

  return useMutation({
    mutationFn: async (labData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(labData);
      } else {
        return walletMutation.mutateAsync(labData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Lab added successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab via unified hook:', error);
    },
    ...options,
  });
};

/**
 * SSO Hook for /api/contract/lab/updateLabSSO endpoint
 * Updates a lab using server wallet (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async (updateData) => {
      const response = await fetch('/api/contract/lab/updateLabSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`Failed to update lab: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useUpdateLabSSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Use cache utilities for granular updates
      try {
        if (variables.labId && variables.labData) {
          const updatedLab = {
            ...variables.labData,
            id: variables.labId,
            labId: variables.labId,
            timestamp: new Date().toISOString()
          };

          updateLab(variables.labId, updatedLab);
          
          // If URI changed, invalidate metadata queries for the new URI
          if (variables.labData.uri) {
            queryClient.invalidateQueries({ 
              queryKey: metadataQueryKeys.byUri(variables.labData.uri),
              exact: true,
              refetchType: 'active' // Force refetch active queries even if not stale
            });
            devLog.log('✅ URI changed, metadata invalidated for:', variables.labData.uri);
          }
          
          devLog.log('✅ Lab updated successfully via SSO, cache updated granularly');
        } else {
          devLog.error('No lab ID or data received, falling back to invalidation');
          invalidateAllLabs();
        }
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab:', error);
    },
    ...options,
  });
};

/**
 * Wallet Hook for updating labs using wagmi
 * Updates a lab using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: updateLabContract } = useContractWriteFunction('updateLab');

  return useMutation({
    mutationFn: async (updateData) => {
      // Handle both flat and nested structures
      const labId = updateData.labId;
      const labDataObj = updateData.labData || updateData;
      
      // Ensure all required parameters are defined before sending to smart contract
      const uri = labDataObj.uri || '';
      const rawPrice = labDataObj.price || '0'; // Default to 0 if price is undefined
      
      // Price is already in correct contract units (converted in ProviderDashboardPage.js)
      // No additional conversion needed - just ensure it's a valid BigInt
      let priceInContractUnits;
      try {
        priceInContractUnits = BigInt(rawPrice.toString());
      } catch (error) {
        devLog.error('Error converting price to BigInt:', { rawPrice, error });
        // Fallback to 0 if conversion fails
        priceInContractUnits = BigInt('0');
      }
      
      const auth = labDataObj.auth || '';
      const accessURI = labDataObj.accessURI || '';
      const accessKey = labDataObj.accessKey || '';
      
      const txHash = await updateLabContract([labId, uri, priceInContractUnits, auth, accessURI, accessKey]);
      
      devLog.log('🔍 useUpdateLabWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Use cache utilities for granular updates
      try {
        if (variables.labId && variables.labData) {
          const updatedLab = {
            ...variables.labData,
            id: variables.labId,
            labId: variables.labId,
            transactionHash: result.hash,
            isPending: true, // Still pending blockchain confirmation
            timestamp: new Date().toISOString()
          };

          updateLab(variables.labId, updatedLab);
          
          // If URI changed, invalidate metadata queries for the new URI
          if (variables.labData.uri) {
            queryClient.invalidateQueries({ 
              queryKey: metadataQueryKeys.byUri(variables.labData.uri),
              exact: true,
              refetchType: 'active' // Force refetch active queries even if not stale
            });
            devLog.log('✅ URI changed, metadata invalidated for:', variables.labData.uri);
          }
          
          devLog.log('✅ Lab updated successfully via wallet, cache updated granularly');
        } else {
          devLog.error('No lab ID or data received, falling back to invalidation');
          invalidateAllLabs();
        }
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for updating labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUpdateLabSSO(options);
  const walletMutation = useUpdateLabWallet(options);

  return useMutation({
    mutationFn: async (updateData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(updateData);
      } else {
        return walletMutation.mutateAsync(updateData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Lab updated successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab via unified hook:', error);
    },
    ...options,
  });
};

/**
 * SSO Hook for /api/contract/lab/deleteLabSSO endpoint
 * Deletes a lab using server wallet (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDeleteLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticLab, removeLab, invalidateAllLabs } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async (labId) => {
      // Create optimistic deletion state for immediate UI feedback
      const optimisticDeletedLab = addOptimisticLab({
        id: labId,
        labId: labId,
        isDeleted: true,
        isPending: true,
        status: 'deleting'
      });

      try {
        devLog.log('🎯 Optimistic lab deletion:', labId);

        const response = await fetch('/api/contract/lab/deleteLabSSO', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labId })
        });

        if (!response.ok) {
          throw new Error(`Failed to delete lab: ${response.status}`);
        }

        const data = await response.json();
        devLog.log('🔍 useDeleteLabSSO:', data);
        return { ...data, optimisticId: optimisticDeletedLab.id };
      } catch (error) {
        // Remove optimistic update on error
        removeLab(optimisticDeletedLab.id);
        throw error;
      }
    },
    onSuccess: (data, labId) => {
      // Use cache utilities for complete deletion
      try {
        removeLab(labId);
        devLog.log('✅ Lab deleted successfully, cache updated granularly');
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab:', error);
    },
    ...options,
  });
};

/**
 * Wallet Hook for deleting labs using wagmi
 * Deletes a lab using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDeleteLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticLab, removeLab, updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: deleteLab } = useContractWriteFunction('deleteLab');

  return useMutation({
    mutationFn: async (labId) => {
      // Create optimistic deletion state for immediate UI feedback
      const optimisticDeletingLab = addOptimisticLab({
        id: labId,
        labId: labId,
        isDeleted: false, // Not deleted yet, just processing
        isPending: true,
        status: 'deleting'
      });

      try {
        devLog.log('🎯 Optimistic lab deletion via wallet:', labId);

        const txHash = await deleteLab([labId]);
        
        devLog.log('🔍 useDeleteLabWallet - Transaction Hash:', txHash);
        return { hash: txHash, optimisticId: optimisticDeletingLab.id };
      } catch (error) {
        // Remove optimistic update on error
        removeLab(optimisticDeletingLab.id);
        throw error;
      }
    },
    onSuccess: (result, labId) => {
      // Use cache utilities to show transaction sent
      try {
        const transactionPendingLab = {
          id: labId,
          labId: labId,
          transactionHash: result.hash,
          isPending: true, // Still pending blockchain confirmation
          status: 'pending-deletion',
          timestamp: new Date().toISOString()
        };

        updateLab(labId, transactionPendingLab);
        devLog.log('✅ Lab deletion transaction sent via wallet, awaiting blockchain confirmation');
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for deleting labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useDeleteLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useDeleteLabSSO(options);
  const walletMutation = useDeleteLabWallet(options);

  return useMutation({
    mutationFn: async (labId) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(labId);
      } else {
        return walletMutation.mutateAsync(labId);
      }
    },
    onSuccess: (data, labId) => {
      devLog.log('✅ Lab deleted successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/lab/setTokenURI endpoint using server wallet (SSO users)
 * Sets token URI using server wallet for SSO users (typically admin/owner only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useSetTokenURISSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async (uriData) => {
      const response = await fetch('/api/contract/lab/setTokenURI', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uriData)
      });

      if (!response.ok) {
        throw new Error(`Failed to set token URI: ${response.status}`);
      }

      const data = await response.json();
      devLog.log('🔍 useSetTokenURISSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Use cache utilities for granular updates
      try {
        if (variables.labId) {
          // Update the lab with the new URI information
          const updatedLabData = {
            tokenURI: variables.tokenURI,
            timestamp: new Date().toISOString()
          };

          updateLab(variables.labId, updatedLabData);

          // Invalidate specific lab's tokenURI query
          queryClient.invalidateQueries({ queryKey: labQueryKeys.tokenURI(variables.labId) });
          
          devLog.log('✅ Token URI set successfully via SSO, cache updated granularly');
        } else {
          devLog.error('No lab ID received, falling back to invalidation');
          invalidateAllLabs();
        }
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via SSO:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based setTokenURI using useContractWriteFunction
 * Sets token URI using user's wallet (typically admin/owner only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useSetTokenURIWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: setTokenURI } = useContractWriteFunction('setTokenURI');

  return useMutation({
    mutationFn: async (uriData) => {
      // Ensure all required parameters are defined before sending to smart contract
      const labId = uriData.labId;
      const tokenURI = uriData.tokenURI || '';
      
      const txHash = await setTokenURI([labId, tokenURI]);
      
      devLog.log('🔍 useSetTokenURIWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      // Use cache utilities for granular updates
      try {
        if (variables.labId) {
          // Update the lab with the new URI information and transaction hash
          const updatedLabData = {
            tokenURI: variables.tokenURI,
            transactionHash: result.hash,
            isPending: true, // Still pending blockchain confirmation
            timestamp: new Date().toISOString()
          };

          updateLab(variables.labId, updatedLabData);

          // Invalidate specific lab's tokenURI query
          queryClient.invalidateQueries({ queryKey: labQueryKeys.tokenURI(variables.labId) });
          
          devLog.log('✅ Token URI set successfully via wallet, cache updated granularly');
        } else {
          devLog.error('No lab ID received, falling back to invalidation');
          invalidateAllLabs();
        }
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for setting token URI (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useSetTokenURI = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useSetTokenURISSO(options);
  const walletMutation = useSetTokenURIWallet(options);

  return useMutation({
    mutationFn: async (uriData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(uriData);
      } else {
        return walletMutation.mutateAsync(uriData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('✅ Token URI set successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via unified hook:', error);
    },
    ...options,
  });
};

/**
 * List Lab Mutation Hook (SSO)
 * Lists a lab using server wallet for SSO users
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for listing labs
 */
export const useListLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { setOptimisticListingState, clearOptimisticListingState } = useOptimisticUI();
  
  return useMutation({
    mutationFn: async (labId) => {
      // Set optimistic UI state immediately
      setOptimisticListingState(labId, true, true);
      
      const response = await fetch('/api/contract/lab/listLabSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to list lab');
      }
      
      return response.json();
    },
    onSuccess: (data, labId) => {
      // Clear optimistic state and update cache with real data
      clearOptimisticListingState(labId);
      
      try {
        const confirmedListedLab = {
          ...data,
          id: labId,
          labId: labId,
          isListed: true,
          status: 'listed',
          isPending: false,
          timestamp: new Date().toISOString()
        };

        updateLab(labId, confirmedListedLab);
        devLog.log('✅ Lab listed successfully via SSO, cache updated granularly');
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error, labId) => {
      // Clear optimistic state on error
      clearOptimisticListingState(labId);
      devLog.error('❌ Failed to list lab:', error);
    },
    ...options,
  });
};

/**
 * List Lab Mutation Hook (Wallet)
 * Lists a lab using user's wallet
 * @param {Object} options - Mutation options  
 * @returns {Object} React Query mutation for listing labs
 */
export const useListLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState } = useOptimisticUI();
  const { contractWriteFunction: listToken } = useContractWriteFunction('listToken');
  
  return useMutation({
    mutationFn: async (labId) => {
      // Set optimistic UI state immediately
      setOptimisticListingState(labId, true, true);
      
      const txHash = await listToken([labId]);
      
      devLog.log('🔍 useListLabWallet - Transaction Hash:', txHash);
      return { hash: txHash, labId };
    },
    onSuccess: (result, labId) => {
      // Transaction sent successfully - complete optimistic state
      completeOptimisticListingState(labId);
      
      try {
        // Update listing status cache with complete response format
        queryClient.setQueryData(labQueryKeys.isTokenListed(labId), {
          labId: parseInt(labId),
          isListed: true,
          timestamp: new Date().toISOString(),
          processingTime: 0 // Optimistic update, no processing time
        });        
        const transactionCompleteLab = {
          id: labId,
          labId: labId,
          transactionHash: result.hash,
          isPending: false, // Transaction sent and completed
          status: 'listed',
          timestamp: new Date().toISOString()
        };

        updateLab(labId, transactionCompleteLab);
        devLog.log('✅ Lab listing transaction completed successfully');
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error, labId) => {
      // Clear optimistic state on error
      clearOptimisticListingState(labId);
      devLog.error('❌ Failed to list lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for listing labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useListLab = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useListLabSSO(options);
  const walletMutation = useListLabWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Unlist Lab Mutation Hook (SSO)
 * Unlists a lab using server wallet for SSO users
 * @param {Object} options - Mutation options
 * @returns {Object} React Query mutation for unlisting labs
 */
export const useUnlistLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { setOptimisticListingState, clearOptimisticListingState } = useOptimisticUI();
  
  return useMutation({
    mutationFn: async (labId) => {
      // Set optimistic UI state immediately
      setOptimisticListingState(labId, false, true);
      
      const response = await fetch('/api/contract/lab/unlistLabSSO', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unlist lab');
      }
      
      return response.json();
    },
    onSuccess: (data, labId) => {
      // Clear optimistic state and update cache with real data
      clearOptimisticListingState(labId);
      
      try {
        const confirmedUnlistedLab = {
          ...data,
          id: labId,
          labId: labId,
          isListed: false,
          status: 'unlisted',
          isPending: false,
          timestamp: new Date().toISOString()
        };

        updateLab(labId, confirmedUnlistedLab);
        devLog.log('✅ Lab unlisted successfully via SSO, cache updated granularly');
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error, labId) => {
      // Clear optimistic state on error
      clearOptimisticListingState(labId);
      devLog.error('❌ Failed to unlist lab:', error);
    },
    ...options,
  });
};

/**
 * Unlist Lab Mutation Hook (Wallet)
 * Unlists a lab using user's wallet
 * @param {Object} options - Mutation options  
 * @returns {Object} React Query mutation for unlisting labs
 */
export const useUnlistLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState } = useOptimisticUI();
  const { contractWriteFunction: unlistToken } = useContractWriteFunction('unlistToken');
  
  return useMutation({
    mutationFn: async (labId) => {
      // Set optimistic UI state immediately
      setOptimisticListingState(labId, false, true);
      
      const txHash = await unlistToken([labId]);
      
      devLog.log('🔍 useUnlistLabWallet - Transaction Hash:', txHash);
      return { hash: txHash, labId };
    },
    onSuccess: (result, labId) => {
      // Transaction sent successfully - complete optimistic state
      completeOptimisticListingState(labId);
      
      try {
        // Update listing status cache with complete response format
        queryClient.setQueryData(labQueryKeys.isTokenListed(labId), {
          labId: parseInt(labId),
          isListed: false,
          timestamp: new Date().toISOString(),
          processingTime: 0 // Optimistic update, no processing time
        });        
        const transactionCompleteLab = {
          id: labId,
          labId: labId,
          transactionHash: result.hash,
          isPending: false, // Transaction sent and completed
          status: 'unlisted',
          timestamp: new Date().toISOString()
        };

        updateLab(labId, transactionCompleteLab);
        devLog.log('✅ Lab unlisting transaction completed successfully');
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error, labId) => {
      // Clear optimistic state on error
      clearOptimisticListingState(labId);
      devLog.error('❌ Failed to unlist lab via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for unlisting labs (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUnlistLab = (options = {}) => {
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useUnlistLabSSO(options);
  const walletMutation = useUnlistLabWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

// Re-export cache updates utility
export { useLabCacheUpdates } from './useLabCacheUpdates';
