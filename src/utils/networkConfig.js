import { mainnet, polygon, sepolia } from 'wagmi/chains';

export const defaultChain = sepolia;

export const infuraNetworks = {
  [mainnet.id]: process.env.NEXT_PUBLIC_INFURA_MAINNET_URL,
  [polygon.id]: process.env.NEXT_PUBLIC_INFURA_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_INFURA_SEPOLIA_URL,
};

export const alchemyNetworks = {
  [mainnet.id]: process.env.NEXT_PUBLIC_ALCHEMY_MAINNET_URL,
  [polygon.id]: process.env.NEXT_PUBLIC_ALCHEMY_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_ALCHEMY_SEPOLIA_URL,
};