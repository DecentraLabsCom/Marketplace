/**
 * Mock for 'wagmi' hooks and utilities used in tests (CommonJS).
 */
/* global jest */
const { mainnet, sepolia } = require('./wagmiChains');

const wagmiMock = {
    useWriteContract: jest.fn(() => ({
      data: undefined,
      isLoading: false,
      isError: false,
      error: undefined,
      write: jest.fn(),
      status: 'idle',
      reset: jest.fn(),
    })),
  useConnection: () => ({ accounts: ['0x123'], chain: { id: 1, name: 'sepolia' }, status: 'connected' }),
  useConnect: () => ({ connect: jest.fn(), connectors: [] }),
  useDisconnect: () => ({ disconnect: jest.fn() }),
  useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
  useBalance: () => ({ data: { formatted: '10.5', symbol: 'LAB' } }),
  useReadContract: jest.fn(() => ({
      useWriteContract: jest.fn(() => ({
        data: undefined,
        isLoading: false,
        isError: false,
        error: undefined,
        write: jest.fn(),
        status: 'idle',
        reset: jest.fn(),
      })),
    data: undefined,
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: jest.fn(),
  })),
  usePublicClient: jest.fn(() => ({
    chain: { id: 1, name: 'sepolia' },
    transport: {},
    request: jest.fn(),
  })),
  WagmiProvider: ({ children }) => children,
  createConfig: jest.fn((config) => ({
    chains: config?.chains || [mainnet, sepolia],
    transports: config?.transports || {},
    connectors: config?.connectors || [],
  })),
  http: jest.fn(() => ({})),
  fallback: jest.fn((providers) => providers[0] || {}),
};
wagmiMock.default = wagmiMock;
module.exports = wagmiMock;