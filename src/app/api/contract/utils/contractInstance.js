import { ethers } from 'ethers'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab'
import { defaultChain } from '@/utils/blockchain/networkConfig.js'
import getProvider from './getProvider'

export async function getContractInstance(contractType = 'diamond') {
  const provider = await getProvider(defaultChain);
  const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

  const chainKey = defaultChain.name.toLowerCase();
  
  // Choose contract based on type
  let address, abi;
  if (contractType === 'lab') {
    address = contractAddressesLAB[chainKey];
    abi = labTokenABI;
    if (!address) {
      throw new Error(`No LAB token address defined for network "${chainKey}"`);
    }
  } else {
    // Default: diamond contract
    address = contractAddresses[chainKey];
    abi = contractABI;
    if (!address) {
      throw new Error(`No contract address defined for network "${chainKey}"`);
    }
  }

  return new ethers.Contract(
    address,
    abi,
    signer
  );
}
