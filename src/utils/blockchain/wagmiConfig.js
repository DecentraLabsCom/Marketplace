import { http, webSocket, createConfig, fallback } from 'wagmi'
import { mainnet, polygon, sepolia } from 'wagmi/chains'
import { walletConnect, metaMask} from 'wagmi/connectors'
import { defaultNetworks, alchemyNetworks, moralisNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks, infuraNetworks } from '@/utils/blockchain/networkConfig'
import { getWalletConnectMetadata } from '@/utils/env/baseUrl'
import devLog from '@/utils/dev/logger'

let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
let cloudReownId = process.env.NEXT_PUBLIC_CLOUD_REOWN_ID;
const enableWsEvents = String(process.env.NEXT_PUBLIC_ENABLE_WSS_EVENTS || 'false').toLowerCase() === 'true';
const sepoliaWsUrl = process.env.NEXT_PUBLIC_SEPOLIA_WS_URL;
const mainnetWsUrl = process.env.NEXT_PUBLIC_MAINNET_WS_URL;
const polygonWsUrl = process.env.NEXT_PUBLIC_POLYGON_WS_URL;

const chains = [mainnet, polygon, sepolia];

// Cache para evitar recrear transports múltiples veces
let _cachedTransports = null;
let _cachedConfig = null;

// Debug function to reset cache (useful during development)
export const resetWagmiCache = () => {
  devLog.log('[wagmiConfig] Resetting cache...');
  _cachedTransports = null;
  _cachedConfig = null;
};

// Función para crear transports solo una vez
const createTransports = () => {
  if (_cachedTransports) {
    return _cachedTransports;
  }
  const isBrowser = typeof window !== 'undefined';

  // Helper function to create a validated HTTP transport
  const createValidatedTransport = (url, key) => {
    if (!url || url === 'undefined' || url.includes('undefined')) {
      devLog.warn(`[wagmiConfig] Invalid URL for ${key}:`, url);
      return null;
    }
    
    return http(url, {
      key,
      retryCount: 1,
      batch: {
        wait: 200,
        batchSize: 3,  // Limit batch size for free tier compatibility
      },
      // Enable polling for events with reasonable interval
      pollingInterval: 4_000, // 4 seconds - balance between responsiveness and rate limits
    });
  };

  const createValidatedWsTransport = (url, key) => {
    if (!isBrowser) return null;
    if (!enableWsEvents) return null;
    if (!url || url === 'undefined' || url.includes('undefined')) {
      return null;
    }

    const trimmed = String(url).trim();
    if (!trimmed || !/^wss?:\/\//i.test(trimmed)) {
      devLog.warn(`[wagmiConfig] Invalid WS URL for ${key}:`, url);
      return null;
    }

    try {
      return webSocket(trimmed, {
        key,
        retryCount: 1,
      });
    } catch (err) {
      devLog.warn(`[wagmiConfig] Failed creating WS transport for ${key}:`, err?.message || err);
      return null;
    }
  };

  // Create fallback array with the most reliable providers first.
  // WS is optional and controlled via NEXT_PUBLIC_ENABLE_WSS_EVENTS.
  const fallbackProviders = [];
  const wsTransport = createValidatedWsTransport(sepoliaWsUrl, 'sepolia-ws');
  if (wsTransport) {
    fallbackProviders.push(wsTransport);
  }
  const publicSepoliaUrls = [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia'
  ];
  
  // Helper function to safely construct URLs
  const constructUrl = (base, id = '') => {
    if (!base || base === 'undefined') return null;
    const trimmed = base.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      return trimmed;
    }
    const url = id ? `https://${trimmed}${id}` : `https://${trimmed}`;
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
  
  // Add public RPCs (browser-safe) to strengthen fallback reliability
  publicSepoliaUrls.forEach((url, index) => {
    const transport = createValidatedTransport(url, `public-${index + 1}`);
    if (transport) fallbackProviders.push(transport);
  });
  
  // Ensure we have at least one valid transport for sepolia
  if (fallbackProviders.length === 0) {
    devLog.error('[wagmiConfig] No valid transports configured! Using public RPC as last resort');
    fallbackProviders.push(http('https://ethereum-sepolia-rpc.publicnode.com', {
      key: 'public-fallback',
      retryCount: 1,
      pollingInterval: 4_000,
    }));
  }

  devLog.log(`[wagmiConfig] Created ${fallbackProviders.length} valid transports for sepolia`);

  const fallbackSepoliaTransport = fallback(fallbackProviders);

  // Generic transports for other chains (we mainly use sepolia)
  // Use public RPC endpoints as fallback for mainnet and polygon
  const mainnetHttpTransport = http('https://ethereum-rpc.publicnode.com', {
    key: 'mainnet-public',
    batch: { batchSize: 3 },
    pollingInterval: 4_000,
  });
  
  const polygonHttpTransport = http('https://polygon-rpc.com', {
    key: 'polygon-public', 
    batch: { batchSize: 3 },
    pollingInterval: 4_000,
  });

  const mainnetTransport = enableWsEvents
    ? fallback([
      createValidatedWsTransport(mainnetWsUrl, 'mainnet-ws'),
      mainnetHttpTransport,
    ].filter(Boolean))
    : mainnetHttpTransport;

  const polygonTransport = enableWsEvents
    ? fallback([
      createValidatedWsTransport(polygonWsUrl, 'polygon-ws'),
      polygonHttpTransport,
    ].filter(Boolean))
    : polygonHttpTransport;

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

  const connectors = [];

  if (cloudReownId) {
    connectors.push(walletConnect({ projectId: cloudReownId, metadata: metadata }));
  } else {
    devLog.warn('[wagmiConfig] WalletConnect project ID missing; WalletConnect disabled.');
  }

  connectors.push(metaMask({ dappMetadata: metadata }));

  _cachedConfig = createConfig({
    chains: chains,
    connectors: connectors,
    transports: transports,
  });

  return _cachedConfig;
};

const config = createWagmiConfig();

export default config;
