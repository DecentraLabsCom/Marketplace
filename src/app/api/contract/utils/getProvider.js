import { ethers } from 'ethers'
import { defaultNetworks, alchemyNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks } from '@/utils/blockchain/networkConfig'

// Provider cache to avoid reinitializing providers unnecessarily
const providerCache = new Map();
const PROVIDER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache

/**
 * Creates and caches a fallback provider for the specified network
 * Combines multiple provider services with optimized timeouts and error handling
 * 
 * @param {Object} network - Network configuration object
 * @returns {Promise<ethers.FallbackProvider>} Configured fallback provider with multiple services
 * @throws {Error} If no providers can be initialized
 */
export default async function getProvider(network) {
    // Check cache first
    const cacheKey = `${network.name}_${network.id}`;
    const cached = providerCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < PROVIDER_CACHE_TTL) {
        console.log(`Using cached FallbackProvider for ${network.name} (contains ${cached.providerCount || 'unknown'} providers)`);
        return cached.provider;
    }

    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
    let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
    let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    const rpcUrl = network.rpcUrls.default.http[0];
    const networkInfo = { name: network.name, chainId: network.id };
    
    // Optimized options for faster response and better reliability
    const options = {
        batchMaxCount: 5,        // Reduced batch size for faster processing
        timeout: 5000,           // 5 second timeout per provider
    };

    const providers = [];

    // ✅ PRIORITY 1: Specialized providers (most reliable for reads)
    if (alchemyProjectId) {
        try {
            providers.push({
                provider: new ethers.AlchemyProvider(network.id, alchemyProjectId),
                priority: 1,
                weight: 2,  // Higher weight = higher preference
                stallTimeout: 1500  // Fast response expected
            });
            console.log('✅ Added Alchemy provider');
        } catch (e) {
            console.warn('❌ Alchemy provider failed to initialize:', e.message);
        }
    }

    if (infuraProjectId) {
        try {
            providers.push({
                provider: new ethers.InfuraProvider(
                  network.id,
                  infuraSecretKey
                    ? { projectId: infuraProjectId, projectSecret: infuraSecretKey }
                    : infuraProjectId
                ),
                priority: 1,
                weight: 2,
                stallTimeout: 1500
            });
            console.log('✅ Added Infura provider');
        } catch (e) {
            console.warn('❌ Infura provider failed to initialize:', e.message);
        }
    }

    // ✅ PRIORITY 2: HTTP providers (reliable but slower)
    if (alchemyProjectId) {
        try {
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    `https://${alchemyNetworks[network.id]}${alchemyProjectId}`,
                    network.id,
                    options
                ),
                priority: 2,
                weight: 1,
                stallTimeout: 2000
            });
            console.log('✅ Added Alchemy HTTP provider');
        } catch (e) {
            console.warn('❌ Alchemy HTTP provider failed to initialize:', e.message);
        }
    }

    if (ankrProjectId) {
        try {
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    `https://${ankrNetworks[network.id]}${ankrProjectId}`,
                    network.id,
                    options
                ),
                priority: 2,
                weight: 1,
                stallTimeout: 2000
            });
            console.log('✅ Added Ankr HTTP provider');
        } catch (e) {
            console.warn('❌ Ankr provider failed to initialize:', e.message);
        }
    }

    if (quicknodeProjectId) {
        try {
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    `https://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
                    network.id,
                    options
                ),
                priority: 2,
                weight: 1,
                stallTimeout: 2000
            });
            console.log('✅ Added Quicknode HTTP provider');
        } catch (e) {
            console.warn('❌ Quicknode HTTP provider failed to initialize:', e.message);
        }
    }

    if (chainstackProjectId) {
        try {
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    `https://${chainstackNetworks[network.id]}${chainstackProjectId}`,
                    network.id,
                    options
                ),
                priority: 2,
                weight: 1,
                stallTimeout: 2000
            });
            console.log('✅ Added Chainstack HTTP provider');
        } catch (e) {
            console.warn('❌ Chainstack provider failed to initialize:', e.message);
        }
    }

    // ✅ PRIORITY 3: Public RPC (fallback)
    try {
        providers.push({
            provider: new ethers.JsonRpcProvider(rpcUrl, network.id, options),
            priority: 3,
            weight: 1,
            stallTimeout: 3000  // Longer timeout for public RPC
        });
        console.log('✅ Added Public RPC provider');
    } catch (e) {
        console.warn('❌ Public RPC provider failed to initialize:', e.message);
    }

    // ✅ DEFAULT HTTP PROVIDER (last resort)
    try {
        providers.push({
            provider: new ethers.JsonRpcProvider(
                `https://${defaultNetworks[network.id]}`,
                network.id,
                options
            ),
            priority: 4,
            weight: 1,
            stallTimeout: 3000
        });
        console.log('✅ Added Default HTTP provider');
    } catch (e) {
        console.warn('❌ Default HTTP provider failed to initialize:', e.message);
    }

    if (providers.length === 0) {
        throw new Error('No providers could be initialized');
    }

    console.log(`Initialized ${providers.length} providers for ${network.name} with optimized configuration`);
    
    // ✅ ROBUST FALLBACK CONFIGURATION
    const fallbackProvider = new ethers.FallbackProvider(
        providers.map(p => p.provider), 
        network.id,
        {
            quorum: 1,              // Only need 1 successful response
            stallTimeout: 1000,     // 1 second before trying next provider
            priority: 1,            // Lower priority = higher preference
        }
    );

    // Cache the fallback provider with metadata
    providerCache.set(cacheKey, {
        provider: fallbackProvider,
        providerCount: providers.length,
        breakdown: {
            specialized: providers.filter(p => p.priority === 1).length,
            http: providers.filter(p => p.priority === 2).length,
            public: providers.filter(p => p.priority >= 3).length,
        },
        timestamp: Date.now()
    });

    console.log(`Cached ROBUST FallbackProvider for ${network.name} with ${providers.length} providers`);
    
    return fallbackProvider;
}
