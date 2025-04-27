import { http, createConfig, fallback } from 'wagmi';
import { mainnet, polygon, sepolia } from 'wagmi/chains';
import { walletConnect, metaMask} from 'wagmi/connectors';
import { infuraNetworks, alchemyNetworks } from './networkConfig';

let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
let cloudReownId = process.env.NEXT_PUBLIC_CLOUD_REOWN_ID;

const chains = [mainnet, polygon, sepolia];

const defaultTransport = http();

const infuraSepoliaTransport = http(
  `https://${infuraNetworks[sepolia.id]}${infuraProjectId}`, {
  key: 'infura',
  retryCount: 0,
  batch: {
    wait: 200,
  },
});

const alchemySepoliaTransport = http(
  `https://${alchemyNetworks[sepolia.id]}${alchemyProjectId}`, {
  key: 'alchemy',
  retryCount: 0,
  batch: {
    wait: 200,
  },
});

const fallbackSepoliaTransport = fallback([
  infuraSepoliaTransport, alchemySepoliaTransport, defaultTransport
]);

const metadata = {
  name: 'DecentraLabs Marketplace', 
  url: 'https://decentralabs.nebsyst.com', 
  description: 'DecentraLabs is the first decentralized marketplace for laboratories and research facilities, allowing users to book and access a wide range of lab services and resources.', 
  iconUrl: 'https://decentralabs.nebsyst.com/favicon.svg', 
}

export const config = createConfig({
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