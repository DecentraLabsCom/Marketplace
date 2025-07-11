import config from '@/utils/wagmiConfig';
import { defaultChain } from '@/utils/networkConfig';

export const selectChain = (currentChain) => {
    const targetChain = config.chains.find(
      (c) => c.name.toLowerCase() === currentChain?.name.toLowerCase()
    );
    
    return targetChain || defaultChain;
};