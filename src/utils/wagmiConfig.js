import { http, webSocket, createConfig, fallback } from 'wagmi';
import { mainnet, polygon, sepolia } from 'wagmi/chains';
import { walletConnect, metaMask} from 'wagmi/connectors';
import { alchemyNetworks, moralisNetworks, ankrNetworks, quicknodeNetworks, 
        chainstackNetworks, infuraNetworks } from './networkConfig';

let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
let cloudReownId = process.env.NEXT_PUBLIC_CLOUD_REOWN_ID;

const chains = [mainnet, polygon, sepolia];

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
  key: 'moralis',
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
  alchemySepoliaTransport, moralisSepoliaTransport, ankrSepoliaTransport,
  quicknodeSepoliaTransport, chainstackSepoliaTransport, infuraSepoliaTransport, defaultTransport
]);

const metadata = {
  name: 'DecentraLabs Marketplace', 
  url: 'https://marketplace-decentralabs.vercel.app/', 
  description: 'DecentraLabs is the first decentralized marketplace for laboratories and research facilities, allowing users to book and access a wide range of lab services and resources.', 
  iconUrl: 'https://marketplace-decentralabs.vercel.app/favicon.svg', 
}

const config = createConfig({
  autoConnect: true,
  chains: chains,
  connectors: [
    walletConnect({ projectId: cloudReownId, metadata: metadata }),
    metaMask({ dappMetadata: metadata }),
  ],
  transports: {
    [mainnet.id]: defaultTransport,
    [polygon.id]: defaultTransport,
    [sepolia.id]: fallbackSepoliaTransport,
  },
})

export default config;