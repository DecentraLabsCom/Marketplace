/**
 * Diamond Contract addresses + ABI source of truth.
 * ABI is maintained in diamondAbi.json (synced from smart-contracts output).
 */
import contractAbiJson from './diamondAbi.json'

export const contractAddresses = {
  ethereum: process.env.NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_ETHEREUM || '0x...',
  polygon: process.env.NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_POLYGON || '0x...',
  sepolia: process.env.NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_SEPOLIA || '0x...',
}

export const contractABI = contractAbiJson
