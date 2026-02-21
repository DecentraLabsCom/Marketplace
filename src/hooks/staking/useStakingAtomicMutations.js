/**
 * Atomic React Query Hooks for Staking-related Write Operations
 * - useStakeTokens: Stake $LAB tokens (wallet-only for now; SSO intents TBD)
 * - useUnstakeTokens: Unstake $LAB tokens (wallet-only for now; SSO intents TBD)
 *
 * Staking is a provider-level operation that typically happens from the
 * provider's wallet. SSO institutional intent flow can be added later
 * when the intent action codes for staking are registered.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { readContractQueryKey } from '@wagmi/core/query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { stakingQueryKeys } from '@/utils/hooks/queryKeys'
import { contractAddresses } from '@/contracts/diamond'
import { useConnection, usePublicClient } from 'wagmi'
import { getConnectionAddress } from '@/utils/blockchain/connection'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'

// ===== useStakeTokensWallet =====

/**
 * Hook for staking $LAB tokens via wallet direct contract write
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation for staking tokens
 */
export const useStakeTokensWallet = (options = {}) => {
  const queryClient = useQueryClient()
  const connection = useConnection()
  const safeChain = selectChain(connection?.chain)
  const chainKey = safeChain.name.toLowerCase()
  const contractAddress = contractAddresses[chainKey]
  const userAddress = getConnectionAddress(connection)
  const { contractWriteFunction: stakeTokens } = useContractWriteFunction('stakeTokens')
  const publicClient = usePublicClient({ chainId: safeChain.id })

  return useMutation({
    mutationFn: async ({ amount }) => {
      if (!amount) throw new Error('Stake amount is required')

      const amountBigInt = BigInt(amount.toString())
      if (amountBigInt <= 0n) throw new Error('Stake amount must be positive')

      devLog.log('🔒 Staking tokens:', { amount: amountBigInt.toString(), provider: userAddress })

      const txHash = await stakeTokens([amountBigInt])

      devLog.log('🔗 stakeTokens - Transaction Hash:', txHash)

      // Wait for receipt
      if (publicClient) {
        try {
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            timeout: 120_000,
          })
        } catch (err) {
          devLog.error('Failed waiting for stake tx receipt:', err)
        }
      }

      return { hash: txHash, amount: amountBigInt.toString() }
    },
    onSuccess: () => {
      // Invalidate staking queries after successful stake
      if (userAddress) {
        queryClient.invalidateQueries({ queryKey: stakingQueryKeys.stakeInfo(userAddress) })
        queryClient.invalidateQueries({ queryKey: stakingQueryKeys.requiredStake(userAddress) })

        // Also invalidate wagmi readContract cache keys used by wallet query hooks.
        if (contractAddress) {
          queryClient.invalidateQueries({
            queryKey: readContractQueryKey({
              address: contractAddress,
              chainId: safeChain.id,
              functionName: 'getStakeInfo',
              args: [userAddress],
            }),
          })
          queryClient.invalidateQueries({
            queryKey: readContractQueryKey({
              address: contractAddress,
              chainId: safeChain.id,
              functionName: 'getRequiredStake',
              args: [userAddress],
            }),
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: stakingQueryKeys.all() })
    },
    onError: (error) => {
      devLog.error('stakeTokens mutation failed:', error)
    },
    ...options,
  })
}

// ===== useUnstakeTokensWallet =====

/**
 * Hook for unstaking $LAB tokens via wallet direct contract write
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation for unstaking tokens
 */
export const useUnstakeTokensWallet = (options = {}) => {
  const queryClient = useQueryClient()
  const connection = useConnection()
  const safeChain = selectChain(connection?.chain)
  const chainKey = safeChain.name.toLowerCase()
  const contractAddress = contractAddresses[chainKey]
  const userAddress = getConnectionAddress(connection)
  const { contractWriteFunction: unstakeTokens } = useContractWriteFunction('unstakeTokens')
  const publicClient = usePublicClient({ chainId: safeChain.id })

  return useMutation({
    mutationFn: async ({ amount }) => {
      if (!amount) throw new Error('Unstake amount is required')

      const amountBigInt = BigInt(amount.toString())
      if (amountBigInt <= 0n) throw new Error('Unstake amount must be positive')

      devLog.log('🔓 Unstaking tokens:', { amount: amountBigInt.toString(), provider: userAddress })

      const txHash = await unstakeTokens([amountBigInt])

      devLog.log('🔗 unstakeTokens - Transaction Hash:', txHash)

      // Wait for receipt
      if (publicClient) {
        try {
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            timeout: 120_000,
          })
        } catch (err) {
          devLog.error('Failed waiting for unstake tx receipt:', err)
        }
      }

      return { hash: txHash, amount: amountBigInt.toString() }
    },
    onSuccess: () => {
      // Invalidate staking queries after successful unstake
      if (userAddress) {
        queryClient.invalidateQueries({ queryKey: stakingQueryKeys.stakeInfo(userAddress) })
        queryClient.invalidateQueries({ queryKey: stakingQueryKeys.requiredStake(userAddress) })

        // Also invalidate wagmi readContract cache keys used by wallet query hooks.
        if (contractAddress) {
          queryClient.invalidateQueries({
            queryKey: readContractQueryKey({
              address: contractAddress,
              chainId: safeChain.id,
              functionName: 'getStakeInfo',
              args: [userAddress],
            }),
          })
          queryClient.invalidateQueries({
            queryKey: readContractQueryKey({
              address: contractAddress,
              chainId: safeChain.id,
              functionName: 'getRequiredStake',
              args: [userAddress],
            }),
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: stakingQueryKeys.all() })
    },
    onError: (error) => {
      devLog.error('unstakeTokens mutation failed:', error)
    },
    ...options,
  })
}

// ===== Router Hooks =====

/**
 * Hook for staking tokens (Router - currently wallet-only)
 * SSO institutional intents for staking will be added when action codes are registered
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation for staking tokens
 */
export const useStakeTokens = (options = {}) => {
  const walletMutation = useStakeTokensWallet(options)

  // Staking is wallet-only for now; SSO users see a read-only dashboard
  return walletMutation
}

/**
 * Hook for unstaking tokens (Router - currently wallet-only)
 * SSO institutional intents for unstaking will be added when action codes are registered
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation for unstaking tokens
 */
export const useUnstakeTokens = (options = {}) => {
  const walletMutation = useUnstakeTokensWallet(options)

  // Unstaking is wallet-only for now; SSO users see a read-only dashboard
  return walletMutation
}
