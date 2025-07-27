import { http, webSocket, createConfig, fallback } from 'wagmi';
import { mainnet, polygon, sepolia } from 'wagmi/chains';
import { walletConnect, metaMask} from 'wagmi/connectors';
import { defaultNetworks, alchemyNetworks, moralisNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks, infuraNetworks } from '@/utils/blockchain/networkConfig';

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

  const defaultSepoliaTransport = webSocket(
    `wss://${defaultNetworks[sepolia.id]}`, {
    key: 'default',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const alchemySepoliaTransport = webSocket(
    `wss://${alchemyNetworks[sepolia.id]}${alchemyProjectId}`, {
    key: 'alchemy',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const moralisSepoliaTransport = http(
    `https://${moralisNetworks[sepolia.id]}${moralisProjectId}`, {
    key: 'moralis',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const ankrSepoliaTransport = http(
    `https://${ankrNetworks[sepolia.id]}${ankrProjectId}`, {
    key: 'ankr',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const quicknodeSepoliaTransport = webSocket(
    `wss://${quicknodeNetworks[sepolia.id]}${quicknodeProjectId}`, {
    key: 'quicknode',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const chainstackSepoliaTransport = http(
    `https://${chainstackNetworks[sepolia.id]}${chainstackProjectId}`, {
    key: 'chainstack',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const infuraSepoliaTransport = http(
    `https://${infuraNetworks[sepolia.id]}${infuraProjectId}`, {
    key: 'infura',
    retryCount: 0,
    batch: {
      wait: 200,
    },
  });

  const defaultTransport = http();

  const fallbackSepoliaTransport = fallback([
    defaultSepoliaTransport, alchemySepoliaTransport, /*moralisSepoliaTransport,*/ ankrSepoliaTransport,
    quicknodeSepoliaTransport, chainstackSepoliaTransport, infuraSepoliaTransport, defaultTransport
  ]);

  _cachedTransports = {
    [mainnet.id]: defaultTransport,
    [polygon.id]: defaultTransport,
    [sepolia.id]: fallbackSepoliaTransport,
  };

  return _cachedTransports;
};

// Función para crear config solo una vez
const createWagmiConfig = () => {
  if (_cachedConfig) {
    return _cachedConfig;
  }

  const transports = createTransports();

  const metadata = {
    name: 'DecentraLabs Marketplace', 
    url: process.env.NEXT_PUBLIC_BASE_URL, 
    description: 'DecentraLabs is the first decentralized marketplace for laboratories and research facilities, ' +
                 'allowing users to book and access a wide range of lab services and resources.', 
    iconUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/favicon.svg`, 
  }

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