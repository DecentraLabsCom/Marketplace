/**
 * Chain selection utility for blockchain operations
 * Finds matching chain configuration or returns default chain
 */
import config from '@/utils/blockchain/wagmiConfig'
import { defaultChain } from '@/utils/blockchain/networkConfig'

/**
 * Selects appropriate blockchain chain configuration
 * @param {Object} currentChain - Current chain object with name property
 * @param {string} currentChain.name - Name of the current chain
 * @returns {Object} Matching chain configuration or default chain if no match found
 */
export const selectChain = (currentChain) => {
    const targetChain = config.chains.find(
      (c) => c.name.toLowerCase() === currentChain?.name.toLowerCase()
    );
    
    return targetChain || defaultChain;
};