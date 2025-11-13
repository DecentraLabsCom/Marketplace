/**
 * Mock for 'wagmi' hooks and utilities used in tests.
 * ------------------------------------------------
 * Provides default implementations for:
 *  - useAccount: returns a dummy connected account
 *  - useConnect: returns a mocked connect function and empty connectors
 *  - useDisconnect: returns a mocked disconnect function
 *  - useWaitForTransactionReceipt: returns default loading/success state
 *  - useBalance: returns mock balance data
 *  - WagmiProvider: mock provider component that passes through children
 *  - createConfig: mock function for creating wagmi config
 *  - http: mock function for HTTP transport
 * Useful to simulate blockchain interactions without real network calls.
 */

module.exports = {
  // Hooks
  useAccount: () => ({ address: '0x123', chain: { id: 1, name: 'sepolia' }, isConnected: true }),
  useConnect: () => ({ connect: jest.fn(), connectors: [] }),
  useDisconnect: () => ({ disconnect: jest.fn() }),
  useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
  useBalance: () => ({ data: { formatted: '10.5', symbol: 'LAB' } }),

  // Components
  WagmiProvider: ({ children }) => children,

  // Utilities
  createConfig: jest.fn(() => ({})),
  http: jest.fn(() => ({})),
};
