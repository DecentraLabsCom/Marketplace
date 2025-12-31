// Extend Jest with @testing-library matchers
require('@testing-library/jest-dom');

// Resolve next/dynamic in tests so dynamic imports render the real component
jest.mock('next/dynamic', () => {
  const React = require('react');

  return (importer, options = {}) => {
    const Loading = options.loading || null;

    const DynamicComponent = (props) => {
      const [Component, setComponent] = React.useState(null);

      React.useEffect(() => {
        let mounted = true;

        Promise.resolve()
          .then(() => importer())
          .then((mod) => {
            if (mounted) {
              setComponent(() => mod.default || mod);
            }
          });

        return () => {
          mounted = false;
        };
      }, []);

      if (Component) {
        return React.createElement(Component, props);
      }

      return Loading ? React.createElement(Loading, props) : null;
    };

    return DynamicComponent;
  };
});

// Polyfill for TextEncoder/TextDecoder (needed in JSDOM)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock global fetch for JSDOM environment
// This prevents "fetch is not defined" errors in tests
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers(),
    })
  );
}

// Mock WebAuthn PublicKeyCredential for SSO tests
if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
  window.PublicKeyCredential = class PublicKeyCredential {
    static isUserVerifyingPlatformAuthenticatorAvailable() {
      return Promise.resolve(true);
    }
  };
  // Mock navigator.credentials for WebAuthn
  Object.defineProperty(window.navigator, 'credentials', {
    value: {
      get: jest.fn(() => Promise.resolve({
        id: 'mock-credential-id',
        rawId: new ArrayBuffer(32),
        response: {
          clientDataJSON: new ArrayBuffer(100),
          authenticatorData: new ArrayBuffer(37),
          signature: new ArrayBuffer(64),
        },
        type: 'public-key',
      })),
      create: jest.fn(() => Promise.resolve({})),
    },
    writable: true,
    configurable: true,
  });
}

// Centralized mocks for complex external libs
jest.mock('next/router', () => require('./mocks/nextRouter'));
jest.mock('wagmi', () => require('./mocks/wagmi'));
jest.mock('wagmi/chains', () => require('./mocks/wagmiChains'));
jest.mock('viem', () => require('./mocks/viem'));
jest.mock('@/utils/dev/logger', () => require('./mocks/logger'));
jest.mock('i18n-iso-countries', () => {
  const normalizeValue = (value) => (value || '').toString().trim();

  const getName = (code) => {
    const normalized = normalizeValue(code).toUpperCase();
    if (normalized === 'ES') return 'Spain';
    if (normalized === 'PT') return 'Portugal';
    return null;
  };

  const getAlpha2Code = (name) => {
    const normalized = normalizeValue(name).toLowerCase();
    if (!normalized) return null;
    if (normalized === 'spain' || normalized === 'españa' || normalized === 'espana') return 'ES';
    if (normalized === 'portugal') return 'PT';
    return null;
  };

  return {
    registerLocale: () => {},
    getName,
    getAlpha2Code,
  };
});
jest.mock('i18n-iso-countries/langs/en.json', () => ({}));
jest.mock('i18n-iso-countries/langs/es.json', () => ({}));

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

// Suppress noisy React warnings that don't indicate real problems in tests
// These warnings occur with async state updates in integration tests
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = typeof args[0] === 'string' ? args[0] : String(args[0] || '');
  
  // Suppress act() warnings - these are common in integration tests with async effects
  if (message.includes('act(')) {
    return;
  }
  
  // Suppress jsdom navigation warnings (location.assign, location.reload, etc.)
  if (message.includes('Not implemented: navigation')) {
    return;
  }
  
  // Suppress auto-populate terms metadata fetch errors in tests
  if (message.includes('Failed to auto-populate terms metadata')) {
    return;
  }
  
  // Suppress Next.js Image boolean attribute warnings (fill, priority)
  if (message.includes('non-boolean attribute')) {
    return;
  }
  
  originalConsoleError.apply(console, args);
};

// Cleanup after each test to avoid cross-test pollution
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
