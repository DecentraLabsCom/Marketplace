/**
 * Contract instance utility for blockchain interactions
 * Provides configured contract instances with optimized provider configuration
 */
import { ethers } from 'ethers'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab'
import { defaultChain } from '@/utils/blockchain/networkConfig.js'
import getProvider from './getProvider'

/**
 * Creates and configures a contract instance with optimized provider
 * @param {string} [contractType='diamond'] - Type of contract ('diamond' or 'lab')
 * @param {boolean} [readOnly=true] - Whether to create read-only contract (no signer)
 * @returns {Promise<ethers.Contract>} Configured contract instance
 * @throws {Error} If contract address not found for current chain
 */
export async function getContractInstance(contractType = 'diamond', readOnly = true) {
  const provider = await getProvider(defaultChain);
  const chainKey = defaultChain.name.toLowerCase();
  
  // Choose contract based on type
  let address, abi;
  if (contractType === 'lab') {
    address = contractAddressesLAB[chainKey];
    abi = labTokenABI;
    if (!address) {
      throw new Error(`No $LAB token address defined for network "${chainKey}"`);
    }
  } else {
    // Default: diamond contract
    address = contractAddresses[chainKey];
    abi = contractABI;
    if (!address) {
      throw new Error(`No contract address defined for network "${chainKey}"`);
    }
  }

  if (readOnly) {
    // For read-only operations, no signer needed (faster and more efficient)
    return new ethers.Contract(address, abi, provider);
  } else {
    // For write operations, use server wallet signer (for SSO users)
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error('Server wallet private key not found in environment');
    }
    
    const signer = new ethers.Wallet(privateKey, provider);
    
    return new ethers.Contract(address, abi, signer);
  }
}
