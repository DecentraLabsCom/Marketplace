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
    const chains = Array.isArray(config?.chains) ? config.chains : [];
    const currentName = typeof currentChain?.name === 'string'
      ? currentChain.name.toLowerCase()
      : null;
    const targetChain = currentName
      ? chains.find((c) => c?.name?.toLowerCase() === currentName)
      : null;

    return targetChain || defaultChain || chains[0] || currentChain;
};
