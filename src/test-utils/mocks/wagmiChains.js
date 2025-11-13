/**
 * Mock for 'wagmi/chains' module used in tests.
 * ------------------------------------------------
 * Provides mock chain configurations for testing without real network connections.
 * Includes mainnet and common test networks.
 */

module.exports = {
  mainnet: {
    id: 1,
    name: 'Ethereum',
    network: 'homestead',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://eth.public-rpc.com'] },
      public: { http: ['https://eth.public-rpc.com'] },
    },
  },
  sepolia: {
    id: 11155111,
    name: 'Sepolia',
    network: 'sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'SEP', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc.sepolia.org'] },
      public: { http: ['https://rpc.sepolia.org'] },
    },
  },
};
