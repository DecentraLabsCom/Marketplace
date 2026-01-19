/**
 * Atomic React Query Mutation Hooks for User/Provider-related operations
 * Each mutation provides three variants: Wallet, SSO, and Router
 * 
 * Architecture Pattern: Mutations and QueryFn Reuse
 * - Refresh/Validation mutations: Use atomic hook queryFn for consistency
 * - CRUD mutations: Use direct fetch (acceptable for unique operations)
 * - All mutations: Implement optimistic updates where appropriate
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { userQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import { useIsLabProvider, USER_QUERY_CONFIG } from './useUsers'
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
    onSuccess: (result, variables) => {
      // Granular cache update: invalidate provider queries
      if (variables.account) {
        queryClient.invalidateQueries({ queryKey: providerQueryKeys.isLabProvider(variables.account) });
      }
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider added successfully via wallet, cache updated');
    },
    onError: (error, variables, context) => {
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
 * Hook for /api/contract/provider/addProvider endpoint using server wallet (SSO users)
 * Adds a provider using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddProviderSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerData) => {
      const payload = {
        name: providerData.name,
        account: providerData.account,
        email: providerData.email,
        country: providerData.country,
        ...(providerData.authURI && { authURI: providerData.authURI })
      };
      
      const response = await fetch('/api/contract/provider/addProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to add provider via SSO: ${response.status}`);
      }

      const data = await response.json();
      devLog.mutation('useAddProviderSSO:', data);
      return data;
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
    onSuccess: (data, variables) => {
      // Granular cache update: invalidate provider queries
      if (variables.account) {
        queryClient.invalidateQueries({ queryKey: providerQueryKeys.isLabProvider(variables.account) });
      }
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider added successfully via SSO, cache updated');
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (variables.account) {
        queryClient.setQueryData(
          providerQueryKeys.isLabProvider(variables.account),
          { isLabProvider: false, isProvider: false }
        );
      }
      devLog.error('Failed to add provider via SSO:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for adding providers (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useAddProvider = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useAddProviderSSO(options);
  const walletMutation = useAddProviderWallet(options);

  return useMutation({
    mutationFn: async (providerData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(providerData);
      } else {
        return walletMutation.mutateAsync(providerData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.success('Provider added successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('Failed to add provider via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/provider/updateProvider endpoint using server wallet (SSO users)
 * Updates a provider using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateProviderSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateData) => {
      const response = await fetch('/api/contract/provider/updateProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`Failed to update provider: ${response.status}`);
      }

      const data = await response.json();
      devLog.mutation('useUpdateProviderSSO:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Granular cache update: invalidate provider queries
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider updated successfully via SSO, cache updated');
    },
    onError: (error) => {
      devLog.error('Failed to update provider via SSO:', error);
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
    onSuccess: (result, variables) => {
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
 * Unified Hook for updating providers (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useUpdateProvider = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUpdateProviderSSO(options);
  const walletMutation = useUpdateProviderWallet(options);

  return useMutation({
    mutationFn: async (updateData) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(updateData);
      } else {
        return walletMutation.mutateAsync(updateData);
      }
    },
    onSuccess: (data, variables) => {
      devLog.success('Provider updated successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('Failed to update provider via unified hook:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/provider/removeProvider endpoint using server wallet (SSO users)
 * Removes a provider using server wallet for SSO users (admin only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRemoveProviderSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerAddress) => {
      const response = await fetch('/api/contract/provider/removeProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerAddress })
      });

      if (!response.ok) {
        throw new Error(`Failed to remove provider: ${response.status}`);
      }

      const data = await response.json();
      devLog.mutation('useRemoveProviderSSO:', data);
      return data;
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
    onSuccess: (data, providerAddress) => {
      // Granular cache update: remove provider from cache
      queryClient.removeQueries({ queryKey: providerQueryKeys.isLabProvider(providerAddress) });
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider removed successfully via SSO, cache updated');
    },
    onError: (error, providerAddress, context) => {
      // Note: We don't rollback the optimistic update here since we don't know the previous state
      // The next query will correct the cache if needed
      devLog.error('Failed to remove provider via SSO:', error);
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
    onSuccess: (result, providerAddress) => {
      // Granular cache update: remove provider from cache
      queryClient.removeQueries({ queryKey: providerQueryKeys.isLabProvider(providerAddress) });
      queryClient.invalidateQueries({ queryKey: providerQueryKeys.all() });
      devLog.success('Provider removed successfully via wallet, cache updated');
    },
    onError: (error, providerAddress, context) => {
      // Note: We don't rollback the optimistic update here since we don't know the previous state
      // The next query will correct the cache if needed
      devLog.error('Failed to remove provider via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for removing providers (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRemoveProvider = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useRemoveProviderSSO(options);
  const walletMutation = useRemoveProviderWallet(options);

  return useMutation({
    mutationFn: async (providerAddress) => {
      if (isSSO) {
        return ssoMutation.mutateAsync(providerAddress);
      } else {
        return walletMutation.mutateAsync(providerAddress);
      }
    },
    onSuccess: (data, providerAddress) => {
      devLog.success('Provider removed successfully via unified hook');
    },
    onError: (error) => {
      devLog.error('Failed to remove provider via unified hook:', error);
    },
    ...options,
  });
};

devLog.moduleLoaded('✅ User atomic mutations loaded');
