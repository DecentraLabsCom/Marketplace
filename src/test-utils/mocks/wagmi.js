/**
 * Mock for 'wagmi' hooks and utilities used in tests.
 * ------------------------------------------------
 * Provides default implementations for:
 *  - useConnection: returns dummy connection state (Wagmi v3)
 *  - useConnect: returns a mocked connect function and empty connectors
 *  - useDisconnect: returns a mocked disconnect function
 *  - useWaitForTransactionReceipt: returns default loading/success state
 *  - useBalance: returns mock balance data
 *  - WagmiProvider: mock provider component that passes through children
 *  - createConfig: mock function for creating wagmi config with chains array
 *  - http: mock function for HTTP transport
 *  - fallback: mock function for fallback transport
 * Useful to simulate blockchain interactions without real network calls.
 */

// Import mock chains for consistent chain data across tests
const { mainnet, sepolia } = require('./wagmiChains');

module.exports = {
  // Hooks
  useConnection: () => ({ accounts: ['0x123'], chain: { id: 1, name: 'sepolia' }, status: 'connected' }),
  useConnect: () => ({ connect: jest.fn(), connectors: [] }),
  useDisconnect: () => ({ disconnect: jest.fn() }),
  useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
  useBalance: () => ({ data: { formatted: '10.5', symbol: 'LAB' } }),

  // Components
  WagmiProvider: ({ children }) => children,

  // Utilities
  createConfig: jest.fn((config) => ({
    chains: config?.chains || [mainnet, sepolia],
    transports: config?.transports || {},
    connectors: config?.connectors || [],
  })),
  http: jest.fn(() => ({})),
  fallback: jest.fn((providers) => providers[0] || {}),
};
