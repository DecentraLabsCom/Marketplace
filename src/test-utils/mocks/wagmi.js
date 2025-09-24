/**
 * Mock for 'wagmi' hooks used in tests.
 * ------------------------------------------------
 * Provides default implementations for:
 *  - useAccount: returns a dummy connected account
 *  - useConnect: returns a mocked connect function and empty connectors
 *  - useDisconnect: returns a mocked disconnect function
 *  - useWaitForTransactionReceipt: returns default loading/success state
 * Useful to simulate blockchain interactions without real network calls.
 */

module.exports = {
  useAccount: () => ({ address: '0x123', chain: { id: 1, name: 'sepolia' }, isConnected: true }),
  useConnect: () => ({ connect: jest.fn(), connectors: [] }),
  useDisconnect: () => ({ disconnect: jest.fn() }),
  useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
};
