import { renderHook } from '@testing-library/react';
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction';
import useDefaultReadContract from '@/hooks/contract/useDefaultReadContract';

const mockWriteContract = jest.fn();
const mockReadContract = jest.fn();

jest.mock('wagmi', () => ({
  useWriteContract: () => ({ writeContractAsync: mockWriteContract }),
  useReadContract: () => ({ data: null, isLoading: false, refetch: mockReadContract }),
  useAccount: () => ({ address: '0x123', isConnected: true }),
}));

jest.mock('@/contracts/diamond', () => ({
  contractABI: [],
  contractAddresses: { sepolia: '0xContract' },
}));

jest.mock('@/utils/blockchain/selectChain', () => ({
  selectChain: () => ({ name: 'sepolia', id: 11155111 }),
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe('Contract Hooks', () => {
  test('useContractWriteFunction returns function', () => {
    const { result } = renderHook(() => useContractWriteFunction('addLab'));
    expect(result.current.contractWriteFunction).toBeDefined();
    expect(typeof result.current.contractWriteFunction).toBe('function');
  });

  test('useDefaultReadContract returns data', () => {
    const { result } = renderHook(() => useDefaultReadContract({ functionName: 'getLab', args: ['1'] }));
    expect(result.current).toBeDefined();
  });
});
