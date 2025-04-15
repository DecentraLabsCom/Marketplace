import { config } from './wagmiConfig';
import { defaultChain } from './networkConfig';

export const selectChain = (currentChain) => {
    const targetChain = config.chains.find(
      (c) => c.name.toLowerCase() === currentChain?.name.toLowerCase()
    );
    
    return targetChain || defaultChain;
};