import { http, createConfig, fallback } from 'wagmi';
import { mainnet, polygon, sepolia } from 'wagmi/chains';
import { walletConnect, metaMask} from 'wagmi/connectors';

const infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID; // Same Infura project ID for all chains
const infuraSecretKey = process.env.NEXT_PUBLIC_INFURA_SECRET_KEY; // Secret key for authentication

const cloudReknownId = process.env.NEXT_PUBLIC_CLOUD_REKNOWN_ID;

const encodedAuth = btoa(`${infuraProjectId}:${infuraSecretKey}`); // Base64 encode the key:secret
const chains = [mainnet, polygon, sepolia];

console.log(infuraProjectId);
console.log(infuraSecretKey);

export const defaultChain = sepolia;

const infuraNetworks = {
  [mainnet.id]: 'mainnet',
  [polygon.id]: 'polygon-mainnet',
  [sepolia.id]: 'sepolia',
};

const defaultTransport = http();

const infuraSepoliaTransport = http(`https://${sepolia.name}.infura.io/v3/${infuraProjectId}`, {
  key: 'infura',
  retryCount: 0,
  batch: true,
  batch: {
    wait: 200,
  },
  fetchOptions: { 
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${infuraSecretKey}`,
    }
  }
});

//const alchemySepoliaTransport = http(`https://eth-${sepolia.name}.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`);

const fallbackSepoliaTransport = fallback([infuraSepoliaTransport, defaultTransport]);

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
    walletConnect({ projectId: cloudReknownId, metadata: metadata }),
    metaMask({ dappMetadata: metadata }),
  ],
  transports: {
    [mainnet.id]: defaultTransport,
    [polygon.id]: defaultTransport,
    [sepolia.id]: fallbackSepoliaTransport,
  },
})