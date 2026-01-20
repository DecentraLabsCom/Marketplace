/**
 * Atomic React Query Mutation Hooks for User/Provider-related operations.
 *
 * Provider mutations are wallet-only (admin wallet connected to marketplace).
 * - All mutations: Implement optimistic updates where appropriate
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { providerQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'
import { enqueueReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'

// ===== PROVIDER MUTATION HOOKS =====

/**
 * Hook for wallet-based addProvider using useContractWriteFunction
 * Adds a provider using user's wallet (admin only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddProviderWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: addProvider } = useContractWriteFunction('addProvider');

  return useMutation({
    mutationFn: async (providerData) => {
      const params = providerData.authURI
        ? [providerData.name, providerData.account, providerData.email, providerData.country, providerData.authURI]
        : [providerData.name, providerData.account, providerData.email, providerData.country];

      const txHash = await addProvider(params);

      devLog.mutation('useAddProviderWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onMutate: async (variables) => {
      // Optimistic update: assume provider will be added successfully
      if (variables.account) {
        queryClient.setQueryData(
          providerQueryKeys.isLabProvider(variables.account),
          { isLabProvider: true, isProvider: true }
        );
        enqueueReconciliationEntry({
          id: `provider:status:${variables.account}`,
          category: 'provider-status',
          expected: {
            queryKey: providerQueryKeys.isLabProvider(variables.account),
            field: 'isLabProvider',
            value: true,
          },
          queryKeys: [
            providerQueryKeys.all(),
            providerQueryKeys.isLabProvider(variables.account),
          ],
        });
      }

      return { previousData: variables };
    },
    onSuccess: (_result, variables) => {
      // Granular cache update: invalidate provider queries
      if (variables.account) {
        queryClient.invalidateQueries({ queryKey: providerQueryKeys.isLabProvider(variables.account) });
      }
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider added successfully via wallet, cache updated');
    },
    onError: (error, variables) => {
      // Rollback optimistic update
      if (variables.account) {
        queryClient.setQueryData(
          providerQueryKeys.isLabProvider(variables.account),
          { isLabProvider: false, isProvider: false }
        );
      }
      devLog.error('Failed to add provider via wallet:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based updateProvider using useContractWriteFunction
 * Updates a provider using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateProviderWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: updateProvider } = useContractWriteFunction('updateProvider');

  return useMutation({
    mutationFn: async (updateData) => {
      const txHash = await updateProvider([updateData.name, updateData.email, updateData.country]);

      devLog.mutation('useUpdateProviderWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (_result, variables) => {
      // Granular cache update: invalidate provider queries
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider updated successfully via wallet, cache updated');
    },
    onError: (error) => {
      devLog.error('Failed to update provider via wallet:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based removeProvider using useContractWriteFunction
 * Removes a provider using user's wallet (admin only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRemoveProviderWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: removeProvider } = useContractWriteFunction('removeProvider');

  return useMutation({
    mutationFn: async (providerAddress) => {
      const txHash = await removeProvider([providerAddress]);

      devLog.mutation('useRemoveProviderWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onMutate: async (providerAddress) => {
      // Optimistic update: assume provider will be removed successfully
      queryClient.setQueryData(
        providerQueryKeys.isLabProvider(providerAddress),
        { isLabProvider: false, isProvider: false }
      );
      enqueueReconciliationEntry({
        id: `provider:status:${providerAddress}`,
        category: 'provider-status',
        expected: {
          queryKey: providerQueryKeys.isLabProvider(providerAddress),
          field: 'isLabProvider',
          value: false,
        },
        queryKeys: [
          providerQueryKeys.all(),
          providerQueryKeys.isLabProvider(providerAddress),
        ],
      });

      return { previousData: providerAddress };
    },
    onSuccess: (_result, providerAddress) => {
      // Granular cache update: remove provider from cache
      queryClient.removeQueries({ queryKey: providerQueryKeys.isLabProvider(providerAddress) });
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider removed successfully via wallet, cache updated');
    },
    onError: (error) => {
      devLog.error('Failed to remove provider via wallet:', error);
    },
    ...options,
  });
};

devLog.moduleLoaded('バ. User atomic mutations loaded');
