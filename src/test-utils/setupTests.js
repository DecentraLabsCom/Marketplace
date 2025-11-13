// Extend Jest with @testing-library matchers
require('@testing-library/jest-dom');

// Polyfill for TextEncoder/TextDecoder (needed in JSDOM)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Centralized mocks for complex external libs
jest.mock('next/router', () => require('./mocks/nextRouter'));
jest.mock('wagmi', () => require('./mocks/wagmi'));
jest.mock('wagmi/chains', () => require('./mocks/wagmiChains'));
jest.mock('viem', () => require('./mocks/viem'));
jest.mock('@/utils/blockchain/wagmiConfig', () => ({ resetWagmiCache: jest.fn() }));
jest.mock('@/utils/blockchain/networkConfig', () => ({ moralisNetworks: {}, ankrNetworks: {} }));

// Cleanup after each test to avoid cross-test pollution
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
