/**
 * @file Test para los hooks de mutaciones atómicas de staking (useStakingAtomicMutations.js)
 *
 * Cubre:
 * - Stake y unstake de tokens LAB usando el wallet (hooks: useStakeTokens, useUnstakeTokens)
 * - Casos de éxito: llamada al contrato y retorno del hash de la transacción
 * - Casos de error: amount faltante o no positivo (validaciones de entrada)
 *
 * Mockea todas las dependencias externas (wagmi, contractWriteFunction, logger, etc) para aislar la lógica del hook.
 * Usa QueryClientProvider para que React Query funcione correctamente en los tests.
 */
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStakeTokens, useUnstakeTokens } from '../useStakingAtomicMutations'

// Mocks
jest.mock('@/hooks/contract/useContractWriteFunction', () => () => ({
  contractWriteFunction: jest.fn(() => Promise.resolve('0xMOCK_TX_HASH')),
}))
jest.mock('wagmi', () => ({
  useConnection: () => ({ accounts: ['0x123'], chain: { id: 1, name: 'sepolia' }, status: 'connected' }),
  usePublicClient: () => ({
    waitForTransactionReceipt: jest.fn(() => Promise.resolve({ status: 'success' })),
  }),
}))
jest.mock('@/utils/blockchain/connection', () => ({
  getConnectionAddress: () => '0x123',
}))
jest.mock('@/utils/blockchain/selectChain', () => ({
  selectChain: (chain) => ({ id: 1, name: 'sepolia' }),
}))
jest.mock('@/contracts/diamond', () => ({
  contractAddresses: { sepolia: '0xCONTRACT' },
}))
jest.mock('@/utils/hooks/queryKeys', () => ({
  stakingQueryKeys: {
    stakeInfo: (addr) => ['stakeInfo', addr],
    requiredStake: (addr) => ['requiredStake', addr],
  },
}))
jest.mock('@wagmi/core/query', () => ({
  readContractQueryKey: jest.fn(() => ['readContract']),
}))
jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}))

describe('useStakingAtomicMutations', () => {
  const wrapper = ({ children }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )

  it('stakeTokens: calls contract and returns tx hash', async () => {
    const { result } = renderHook(() => useStakeTokens(), { wrapper })
    let data
    await act(async () => {
      data = await result.current.mutateAsync({ amount: 100 })
    })
    expect(data).toEqual({ hash: '0xMOCK_TX_HASH', amount: '100' })
  })

  it('unstakeTokens: calls contract and returns tx hash', async () => {
    const { result } = renderHook(() => useUnstakeTokens(), { wrapper })
    let data
    await act(async () => {
      data = await result.current.mutateAsync({ amount: 50 })
    })
    expect(data).toEqual({ hash: '0xMOCK_TX_HASH', amount: '50' })
  })

  it('stakeTokens: throws if amount is missing or not positive', async () => {
    const { result } = renderHook(() => useStakeTokens(), { wrapper })
    await expect(result.current.mutateAsync({})).rejects.toThrow('Stake amount is required')
    await expect(result.current.mutateAsync({ amount: -1 })).rejects.toThrow('Stake amount must be positive')
  })

  it('unstakeTokens: throws if amount is missing or not positive', async () => {
    const { result } = renderHook(() => useUnstakeTokens(), { wrapper })
    await expect(result.current.mutateAsync({})).rejects.toThrow('Unstake amount is required')
    await expect(result.current.mutateAsync({ amount: -1 })).rejects.toThrow('Unstake amount must be positive')
  })
})
