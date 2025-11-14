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

// Mock blockchain configuration modules with proper chain structures
jest.mock('@/utils/blockchain/wagmiConfig', () => {
  const { mainnet, polygon, sepolia } = require('./mocks/wagmiChains');
  return {
    default: {
      chains: [mainnet, polygon, sepolia],
      transports: {},
      connectors: [],
    },
    resetWagmiCache: jest.fn(),
  };
});

jest.mock('@/utils/blockchain/networkConfig', () => {
  const { sepolia } = require('./mocks/wagmiChains');
  return {
    defaultChain: sepolia,
    defaultNetworks: {},
    alchemyNetworks: {},
    moralisNetworks: {},
    ankrNetworks: {},
    quicknodeNetworks: {},
    chainstackNetworks: {},
    infuraNetworks: {},
  };
});

// Cleanup after each test to avoid cross-test pollution
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
