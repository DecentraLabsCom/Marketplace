/**
 * Blockchain network configuration for the DecentraLabs Marketplace
 * Defines default chains and RPC endpoints for different providers
 */
import { mainnet, polygon, sepolia } from 'wagmi/chains'

/**
 * Default blockchain chain for the application
 * @type {Object} Wagmi chain configuration object
 */
export const defaultChain = sepolia;

/**
 * Default RPC endpoints for supported networks
 * Maps chain IDs to their respective RPC URLs from environment variables
 * @type {Object<number, string>}
 */
export const defaultNetworks = {
  [mainnet.id]: process.env.NEXT_PUBLIC_DEFAULT_MAINNET_URL,
  [polygon.id]: process.env.NEXT_PUBLIC_DEFAULT_POLYGON_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_DEFAULT_SEPOLIA_URL,
};

/**
 * Alchemy RPC endpoints for supported networks
 * Provides alternative RPC endpoints using Alchemy as the provider
 * @type {Object<number, string>}
 */
export const alchemyNetworks = {
  [mainnet.id]: process.env.NEXT_PUBLIC_ALCHEMY_MAINNET_URL,
  [polygon.id]: process.env.NEXT_PUBLIC_ALCHEMY_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_ALCHEMY_SEPOLIA_URL,
};

export const moralisNetworks = {
  //[mainnet.id]: process.env.NEXT_PUBLIC_MORALIS_MAINNET_URL,
  //[polygon.id]: process.env.NEXT_PUBLIC_MORALIS_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_MORALIS_SEPOLIA_URL,
};

export const ankrNetworks = {
  //[mainnet.id]: process.env.NEXT_PUBLIC_ANKR_MAINNET_URL,
  //[polygon.id]: process.env.NEXT_PUBLIC_ANKR_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_ANKR_SEPOLIA_URL,
};

export const quicknodeNetworks = {
  //[mainnet.id]: process.env.NEXT_PUBLIC_QUICKNODE_MAINNET_URL,
  //[polygon.id]: process.env.NEXT_PUBLIC_QUICKNODE_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_QUICKNODE_SEPOLIA_URL,
};

export const chainstackNetworks = {
  //[mainnet.id]: process.env.NEXT_PUBLIC_CHAINSTACK_MAINNET_URL,
  //[polygon.id]: process.env.NEXT_PUBLIC_CHAINSTACK_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_CHAINSTACK_SEPOLIA_URL,
};

export const infuraNetworks = {
  [mainnet.id]: process.env.NEXT_PUBLIC_INFURA_MAINNET_URL,
  [polygon.id]: process.env.NEXT_PUBLIC_INFURA_POLYGON_MAINNET_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_INFURA_SEPOLIA_URL,
};