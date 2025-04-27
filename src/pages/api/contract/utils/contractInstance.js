import { ethers } from 'ethers';
import { contractABI, contractAddresses } from '../../../../contracts/diamond';
import { defaultChain } from '../../../../utils/networkConfig.js';
import getProvider from './getProvider';

export async function getContractInstance() {
  const provider = await getProvider(defaultChain);
  const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
  return new ethers.Contract(
    contractAddresses[defaultChain.name.toLowerCase()],
    contractABI,
    signer
  );
}