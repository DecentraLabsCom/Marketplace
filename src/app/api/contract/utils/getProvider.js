import { ethers } from 'ethers';
import { defaultNetworks, alchemyNetworks, moralisNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks } from '@/utils/networkConfig';

export default async function getProvider(network) {
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
    let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
    let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
    let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    const rpcUrl = network.rpcUrls.default.http[0];
    const networkInfo = { name: network.name, chainId: network.id };
    const options = {batchMaxCount: 3};

    const providers = [];

    // Add both WebSocket and HTTP providers with try-catch
    try {
        providers.push(new ethers.WebSocketProvider(
            `wss://${defaultNetworks[network.id]}`,
            networkInfo
        ));
    } catch (e) {
        console.warn('Default WebSocket provider failed to initialize:', e.message);
    }

    try {
        providers.push(new ethers.JsonRpcProvider(
            `https://${defaultNetworks[network.id]}`,
            networkInfo, options
        ));
    } catch (e) {
        console.warn('Default HTTP provider failed to initialize:', e.message);
    }

    if (alchemyProjectId) {
        try {
            providers.push(new ethers.WebSocketProvider(
                `wss://${alchemyNetworks[network.id]}${alchemyProjectId}`,
                networkInfo
            ));
        } catch (e) {
            console.warn('Alchemy WebSocket provider failed to initialize:', e.message);
        }
        
        try {
            providers.push(new ethers.AlchemyProvider(network.id, alchemyProjectId));
        } catch (e) {
            console.warn('Alchemy provider failed to initialize:', e.message);
        }
    }

    if (ankrProjectId) {
        try {
            providers.push(new ethers.JsonRpcProvider(
                `https://${ankrNetworks[network.id]}${ankrProjectId}`,
                networkInfo, options
            ));
        } catch (e) {
            console.warn('Ankr provider failed to initialize:', e.message);
        }
    }

    if (quicknodeProjectId) {
        try {
            providers.push(new ethers.WebSocketProvider(
                `wss://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
                networkInfo
            ));
        } catch (e) {
            console.warn('Quicknode WebSocket provider failed to initialize:', e.message);
        }
        
        try {
            providers.push(new ethers.JsonRpcProvider(
                `https://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
                networkInfo, options
            ));
        } catch (e) {
            console.warn('Quicknode HTTP provider failed to initialize:', e.message);
        }
    }

    if (chainstackProjectId) {
        try {
            providers.push(new ethers.WebSocketProvider(
                `wss://${chainstackNetworks[network.id]}${chainstackProjectId}`,
                networkInfo
            ));
        } catch (e) {
            console.warn('Chainstack WebSocket provider failed to initialize:', e.message);
        }
        
        try {
            providers.push(new ethers.JsonRpcProvider(
                `https://${chainstackNetworks[network.id]}${chainstackProjectId}`,
                networkInfo, options
            ));
        } catch (e) {
            console.warn('Chainstack HTTP provider failed to initialize:', e.message);
        }
    }

    if (infuraProjectId) {
        try {
            providers.push(
                new ethers.InfuraProvider(
                  network.id,
                  infuraSecretKey
                    ? { projectId: infuraProjectId, projectSecret: infuraSecretKey }
                    : infuraProjectId
                )
            );
        } catch (e) {
            console.warn('Infura provider failed to initialize:', e.message);
        }
    }
    
    // Fallback to the official RPC if others fail
    try {
        providers.push(new ethers.JsonRpcProvider(rpcUrl, networkInfo, options));
    } catch (e) {
        console.warn('Official RPC provider failed to initialize:', e.message);
    }

    if (providers.length === 0) {
        throw new Error('No providers could be initialized');
    }

    console.log(`Initialized ${providers.length} providers for ${network.name}`);
    
    return new ethers.FallbackProvider(providers, networkInfo, {
        quorum: 1,
        stallTimeout: 2000,  // 2 seconds before trying next provider
        priority: 1,         // Lower priority = higher preference
    });
}