import { ethers } from 'ethers';
import { defaultNetworks, alchemyNetworks, moralisNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks } from '@/utils/networkConfig';
import devLog from '@/utils/logger';

// Provider cache to avoid reinitializing providers unnecessarily
const providerCache = new Map();
const PROVIDER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache

export default async function getProvider(network) {
    // Check cache first
    const cacheKey = `${network.name}_${network.id}`;
    const cached = providerCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < PROVIDER_CACHE_TTL) {
        devLog.log(`Using cached FallbackProvider for ${network.name} (contains ${cached.providerCount || 'unknown'} providers, ${providerCache.size} networks cached)`);
        return cached.provider;
    }
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
    let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
    let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
    let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    const rpcUrl = network.rpcUrls.default.http[0];
    const networkInfo = { name: network.name, chainId: network.id };
    const options = {batchMaxCount: 2};

    const providers = [];

    // Add both WebSocket and HTTP providers with try-catch
    try {
        providers.push(new ethers.WebSocketProvider(
            `wss://${defaultNetworks[network.id]}`,
            networkInfo
        ));
    } catch (e) {
        devLog.warn('Default WebSocket provider failed to initialize:', e.message);
    }

    try {
        providers.push(new ethers.JsonRpcProvider(
            `https://${defaultNetworks[network.id]}`,
            networkInfo, options
        ));
    } catch (e) {
        devLog.warn('Default HTTP provider failed to initialize:', e.message);
    }

    if (alchemyProjectId) {
        try {
            providers.push(new ethers.WebSocketProvider(
                `wss://${alchemyNetworks[network.id]}${alchemyProjectId}`,
                networkInfo
            ));
        } catch (e) {
            devLog.warn('Alchemy WebSocket provider failed to initialize:', e.message);
        }
        
        try {
            providers.push(new ethers.AlchemyProvider(network.id, alchemyProjectId));
        } catch (e) {
            devLog.warn('Alchemy provider failed to initialize:', e.message);
        }
    }

    if (ankrProjectId) {
        try {
            providers.push(new ethers.JsonRpcProvider(
                `https://${ankrNetworks[network.id]}${ankrProjectId}`,
                networkInfo, options
            ));
        } catch (e) {
            devLog.warn('Ankr provider failed to initialize:', e.message);
        }
    }

    if (quicknodeProjectId) {
        try {
            providers.push(new ethers.WebSocketProvider(
                `wss://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
                networkInfo
            ));
        } catch (e) {
            devLog.warn('Quicknode WebSocket provider failed to initialize:', e.message);
        }
        
        try {
            providers.push(new ethers.JsonRpcProvider(
                `https://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
                networkInfo, options
            ));
        } catch (e) {
            devLog.warn('Quicknode HTTP provider failed to initialize:', e.message);
        }
    }

    if (chainstackProjectId) {
        try {
            providers.push(new ethers.WebSocketProvider(
                `wss://${chainstackNetworks[network.id]}${chainstackProjectId}`,
                networkInfo
            ));
        } catch (e) {
            devLog.warn('Chainstack WebSocket provider failed to initialize:', e.message);
        }
        
        try {
            providers.push(new ethers.JsonRpcProvider(
                `https://${chainstackNetworks[network.id]}${chainstackProjectId}`,
                networkInfo, options
            ));
        } catch (e) {
            devLog.warn('Chainstack HTTP provider failed to initialize:', e.message);
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
            devLog.warn('Infura provider failed to initialize:', e.message);
        }
    }
    
    // Fallback to the official RPC if others fail
    try {
        providers.push(new ethers.JsonRpcProvider(rpcUrl, networkInfo, options));
    } catch (e) {
        devLog.warn('Official RPC provider failed to initialize:', e.message);
    }

    if (providers.length === 0) {
        throw new Error('No providers could be initialized');
    }

    // Classify providers for logging
    const specialProviders = providers.filter(p => 
        p.constructor.name === 'AlchemyProvider' || 
        p.constructor.name === 'InfuraProvider'
    );
    const httpProviders = providers.filter(p => 
        p.constructor.name === 'JsonRpcProvider'
    );
    const wsProviders = providers.filter(p => 
        p.constructor.name === 'WebSocketProvider'
    );

    devLog.log(`Initialized ${providers.length} providers for ${network.name}: ${specialProviders.length} special + ${httpProviders.length} HTTP + ${wsProviders.length} WebSocket`);
    
    const fallbackProvider = new ethers.FallbackProvider(providers, networkInfo, {
        quorum: 1,
        stallTimeout: 1500,  // 1.5 seconds before trying next provider
        priority: 1,         // Lower priority = higher preference
    });

    // Cache the fallback provider with metadata
    providerCache.set(cacheKey, {
        provider: fallbackProvider,
        providerCount: providers.length,
        breakdown: {
            special: specialProviders.length,
            http: httpProviders.length,
            websocket: wsProviders.length
        },
        timestamp: Date.now()
    });

    devLog.log(`Cached FallbackProvider for ${network.name} with ${providers.length} providers`);
    
    return fallbackProvider;
}
