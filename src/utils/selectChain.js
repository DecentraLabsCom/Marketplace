import { config, defaultChain } from './wagmiConfig';

export const selectChain = (currentChain) => {
    const targetChain = config.chains.find(
      (c) => c.name.toLowerCase() === currentChain?.name.toLowerCase()
    );
    
    return targetChain || defaultChain;
};