import { ethers } from 'ethers';
import { contractABI, contractAddresses } from '../../../contracts/diamond';
import { defaultChain } from '../../../utils/networkConfig.js';
import getProvider from './getProvider';

let provider = null;
let contract = null;

export async function getContractInstance() {
  if (provider) {
    try {
      // Test if provider is still valid
      await provider.getBlockNumber();
    } catch (error) {
      console.error('Provider is no longer valid. ', error);
      provider = null; // Reset provider if not valid anymore
    }
  }

  if (!provider) {
    console.log('Initializing provider...');
    provider = await getProvider(defaultChain);
    contract = null; // Reset contract if provider is re-initialized
  }

  if (!contract) {
    console.log('Initializing contract...');
    contract = new ethers.Contract(
      contractAddresses[defaultChain.name.toLowerCase()],
      contractABI
    ).connect(provider);
  }

  return contract;
}