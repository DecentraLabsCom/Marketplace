import config from '@/utils/blockchain/wagmiConfig'
import { defaultChain } from '@/utils/blockchain/networkConfig'

export const selectChain = (currentChain) => {
    const targetChain = config.chains.find(
      (c) => c.name.toLowerCase() === currentChain?.name.toLowerCase()
    );
    
    return targetChain || defaultChain;
};