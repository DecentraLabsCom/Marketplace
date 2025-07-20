import { ethers } from 'ethers';
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { defaultChain } from '@/utils/networkConfig.js';
import getProvider from './getProvider';

export async function getContractInstance() {
  const provider = await getProvider(defaultChain);
  const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

  const chainKey = defaultChain.name.toLowerCase();
  const address  = contractAddresses[chainKey];

  if (!address) {
    throw new Error(`No contract address defined for network "${chainKey}"`);
  }

  return new ethers.Contract(
    address,
    contractABI,
    signer
  );
}
