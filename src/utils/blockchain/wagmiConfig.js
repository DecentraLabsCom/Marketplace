import { http, webSocket, createConfig, fallback } from 'wagmi'
import { mainnet, polygon, sepolia } from 'wagmi/chains'
import { walletConnect, metaMask} from 'wagmi/connectors'
import { defaultNetworks, alchemyNetworks, moralisNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks, infuraNetworks } from '@/utils/blockchain/networkConfig'
import { getWalletConnectMetadata } from '@/utils/env/baseUrl'

let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
let cloudReownId = process.env.NEXT_PUBLIC_CLOUD_REOWN_ID;

const chains = [mainnet, polygon, sepolia];

// Cache para evitar recrear transports múltiples veces
let _cachedTransports = null;
let _cachedConfig = null;

// Función para crear transports solo una vez
const createTransports = () => {
  if (_cachedTransports) {
    return _cachedTransports;
  }

  // Use HTTP for more stable connections, avoid WebSocket failures
  const defaultSepoliaTransport = http(
    `https://${defaultNetworks[sepolia.id]}`, {
    key: 'default',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const alchemySepoliaTransport = http(
    `https://${alchemyNetworks[sepolia.id]}${alchemyProjectId}`, {
    key: 'alchemy',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const moralisSepoliaTransport = http(
    `https://${moralisNetworks[sepolia.id]}${moralisProjectId}`, {
    key: 'moralis',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const ankrSepoliaTransport = http(
    `https://${ankrNetworks[sepolia.id]}${ankrProjectId}`, {
    key: 'ankr',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const quicknodeSepoliaTransport = http(
    `https://${quicknodeNetworks[sepolia.id]}${quicknodeProjectId}`, {
    key: 'quicknode',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const chainstackSepoliaTransport = http(
    `https://${chainstackNetworks[sepolia.id]}${chainstackProjectId}`, {
    key: 'chainstack',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const infuraSepoliaTransport = http(
    `https://${infuraNetworks[sepolia.id]}${infuraProjectId}`, {
    key: 'infura',
    retryCount: 1,
    batch: {
      wait: 200,
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  const defaultTransport = http({
    batch: {
      batchSize: 3,  // Limit batch size for free tier compatibility
    },
  });

  // Create fallback array with the most reliable providers first
  const fallbackProviders = [];
  
  // Add providers only if they have valid configuration
  if (alchemyProjectId) {
    fallbackProviders.push(alchemySepoliaTransport);
  }
  
  if (moralisProjectId) {
    fallbackProviders.push(moralisSepoliaTransport);
  }
  
  if (ankrProjectId) {
    fallbackProviders.push(ankrSepoliaTransport);
  }
  
  if (quicknodeProjectId) {
    fallbackProviders.push(quicknodeSepoliaTransport);
  }
  
  // Add these providers with caution as they're showing errors
  if (chainstackProjectId) {
    fallbackProviders.push(chainstackSepoliaTransport);
  }
  
  if (infuraProjectId) {
    fallbackProviders.push(infuraSepoliaTransport);
  }
  
  // Always add default providers as fallback
  fallbackProviders.push(defaultSepoliaTransport);
  fallbackProviders.push(defaultTransport);

  const fallbackSepoliaTransport = fallback(fallbackProviders);

  _cachedTransports = {
    [mainnet.id]: defaultTransport,
    [polygon.id]: defaultTransport,
    [sepolia.id]: fallbackSepoliaTransport,
  };

  return _cachedTransports;
};

// Create config just once
const createWagmiConfig = () => {
  if (_cachedConfig) {
    return _cachedConfig;
  }

  const transports = createTransports();

  // Use environment-aware metadata
  const metadata = getWalletConnectMetadata();

  _cachedConfig = createConfig({
    autoConnect: true,
    chains: chains,
    connectors: [
      walletConnect({ projectId: cloudReownId, metadata: metadata }),
      metaMask({ dappMetadata: metadata }),
    ],
    transports: transports,
  });

  return _cachedConfig;
};

const config = createWagmiConfig();

export default config;