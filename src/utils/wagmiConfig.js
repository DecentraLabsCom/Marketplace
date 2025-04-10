import { http, createConfig } from 'wagmi';
import { mainnet, polygon, sepolia } from 'wagmi/chains';
import { walletConnect, metaMask} from 'wagmi/connectors';

const projectId = '0443f18af8d74de3915be673597dd4eb'; // Same Infura project ID for all chains
const chains = [mainnet, polygon, sepolia];

export const defaultChain = sepolia;

const infuraNetworks = {
  [mainnet.id]: 'mainnet',
  [polygon.id]: 'polygon-mainnet',
  [sepolia.id]: 'sepolia',
};

export const config = createConfig({
  autoConnect: true,
  chains: chains,
  connectors: [
    walletConnect({ projectId }),
    metaMask(),
  ],
  /*publicClient: http({
    chains: chains,
    transport: ({ chain }) =>
      http({
        url: `https://${infuraNetworks[chain.id]}.infura.io/v3/${projectId}`,
      }),
  }),*/
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [sepolia.id]: http(),
  },
})