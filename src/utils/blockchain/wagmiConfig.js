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

// Debug function to reset cache (useful during development)
export const resetWagmiCache = () => {
  console.log('[wagmiConfig] Resetting cache...');
  _cachedTransports = null;
  _cachedConfig = null;
};

// Función para crear transports solo una vez
const createTransports = () => {
  if (_cachedTransports) {
    return _cachedTransports;
  }

  // Helper function to create a validated HTTP transport
  const createValidatedTransport = (url, key) => {
    if (!url || url === 'undefined' || url.includes('undefined')) {
      console.warn(`[wagmiConfig] Invalid URL for ${key}:`, url);
      return null;
    }
    
    return http(url, {
      key,
      retryCount: 1,
      batch: {
        wait: 200,
        batchSize: 3,  // Limit batch size for free tier compatibility
      },
    });
  };

  // Create fallback array with the most reliable providers first
  const fallbackProviders = [];
  
  // Helper function to safely construct URLs
  const constructUrl = (base, id = '') => {
    if (!base || base === 'undefined') return null;
    const url = id ? `https://${base}${id}` : `https://${base}`;
    return url.includes('undefined') ? null : url;
  };

  // Add providers only if they have valid configuration AND valid URLs
  if (alchemyProjectId && alchemyNetworks[sepolia.id]) {
    const alchemyUrl = constructUrl(alchemyNetworks[sepolia.id], alchemyProjectId);
    if (alchemyUrl) {
      const transport = createValidatedTransport(alchemyUrl, 'alchemy');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  if (moralisProjectId && moralisNetworks[sepolia.id]) {
    const moralisUrl = constructUrl(moralisNetworks[sepolia.id], moralisProjectId);
    if (moralisUrl) {
      const transport = createValidatedTransport(moralisUrl, 'moralis');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  if (ankrProjectId && ankrNetworks[sepolia.id]) {
    const ankrUrl = constructUrl(ankrNetworks[sepolia.id], ankrProjectId);
    if (ankrUrl) {
      const transport = createValidatedTransport(ankrUrl, 'ankr');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  if (quicknodeProjectId && quicknodeNetworks[sepolia.id]) {
    const quicknodeUrl = constructUrl(quicknodeNetworks[sepolia.id], quicknodeProjectId);
    if (quicknodeUrl) {
      const transport = createValidatedTransport(quicknodeUrl, 'quicknode');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  // Add these providers with caution as they're showing errors
  if (chainstackProjectId && chainstackNetworks[sepolia.id]) {
    const chainstackUrl = constructUrl(chainstackNetworks[sepolia.id], chainstackProjectId);
    if (chainstackUrl) {
      const transport = createValidatedTransport(chainstackUrl, 'chainstack');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  if (infuraProjectId && infuraNetworks[sepolia.id]) {
    const infuraUrl = constructUrl(infuraNetworks[sepolia.id], infuraProjectId);
    if (infuraUrl) {
      const transport = createValidatedTransport(infuraUrl, 'infura');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  // Always add default providers as fallback
  if (defaultNetworks[sepolia.id]) {
    const defaultUrl = constructUrl(defaultNetworks[sepolia.id]);
    if (defaultUrl) {
      const transport = createValidatedTransport(defaultUrl, 'default');
      if (transport) fallbackProviders.push(transport);
    }
  }
  
  // Ensure we have at least one valid transport for sepolia
  if (fallbackProviders.length === 0) {
    console.error('[wagmiConfig] No valid transports configured! Using public RPC as last resort');
    fallbackProviders.push(http('https://ethereum-sepolia-rpc.publicnode.com', {
      key: 'public-fallback',
      retryCount: 1,
    }));
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[wagmiConfig] Created ${fallbackProviders.length} valid transports for sepolia`);
  }

  const fallbackSepoliaTransport = fallback(fallbackProviders);

  // Generic transports for other chains (we mainly use sepolia)
  // Use public RPC endpoints as fallback for mainnet and polygon
  const mainnetTransport = http('https://ethereum-rpc.publicnode.com', {
    key: 'mainnet-public',
    batch: { batchSize: 3 },
  });
  
  const polygonTransport = http('https://polygon-rpc.com', {
    key: 'polygon-public', 
    batch: { batchSize: 3 },
  });

  _cachedTransports = {
    [mainnet.id]: mainnetTransport,
    [polygon.id]: polygonTransport,
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