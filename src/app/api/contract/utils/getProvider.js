import { ethers } from 'ethers'
import { defaultNetworks, alchemyNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks } from '@/utils/blockchain/networkConfig'

// Provider cache to avoid reinitializing providers unnecessarily
const providerCache = new Map();
const PROVIDER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache

function buildRpcUrl(base, projectId) {
    if (!base || typeof base !== 'string') return null;
    const trimmed = base.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
        return trimmed;
    }
    if (projectId) {
        return `https://${trimmed}${projectId}`;
    }
    return `https://${trimmed}`;
}

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
        console.log(`✅ Using cached FallbackProvider for ${network.name} (contains ${cached.providerCount || 'unknown'} providers)`);
        return cached.provider;
    }

    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
    let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
    let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    const rpcUrl = network.rpcUrls?.default?.http?.[0];
    const chainId = network.id;
    
    // Optimized options for faster response and better reliability
    const options = {
        batchMaxCount: 3,        // Limited to 3 for free tier compatibility
        timeout: 3000,           // 3 second timeout per provider
        staticNetwork: true,     // Skip network detection to avoid startup errors
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
                  chainId,
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
    if (alchemyNetworks[network.id]) {
        try {
            const alchemyUrl = buildRpcUrl(alchemyNetworks[network.id], alchemyProjectId);
            if (!alchemyUrl) {
                throw new Error('Alchemy URL not configured');
            }
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    alchemyUrl,
                    {
                        chainId: chainId,
                        name: network.name
                    },
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

    if (ankrNetworks[network.id]) {
        try {
            const ankrUrl = buildRpcUrl(ankrNetworks[network.id], ankrProjectId);
            if (!ankrUrl) {
                throw new Error('Ankr URL not configured');
            }
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    ankrUrl,
                    {
                        chainId: chainId,
                        name: network.name
                    },
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

    if (quicknodeNetworks[network.id]) {
        try {
            const quicknodeUrl = buildRpcUrl(quicknodeNetworks[network.id], quicknodeProjectId);
            if (!quicknodeUrl) {
                throw new Error('Quicknode URL not configured');
            }
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    quicknodeUrl,
                    {
                        chainId: chainId,
                        name: network.name
                    },
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

    if (chainstackNetworks[network.id]) {
        try {
            const chainstackUrl = buildRpcUrl(chainstackNetworks[network.id], chainstackProjectId);
            if (!chainstackUrl) {
                throw new Error('Chainstack URL not configured');
            }
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    chainstackUrl,
                    {
                        chainId: chainId,
                        name: network.name
                    },
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
    if (rpcUrl) {
        try {
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    rpcUrl,
                    {
                        chainId: chainId,
                        name: network.name
                    },
                    options
                ),
                priority: 3,
                weight: 1,
                stallTimeout: 2000
            });
            console.log('✅ Added Public RPC provider');
        } catch (e) {
            console.warn('❌ Public RPC provider failed to initialize:', e.message);
        }
    }

    // ✅ DEFAULT HTTP PROVIDER (last resort)
    if (defaultNetworks[network.id]) {
        try {
            const defaultUrl = buildRpcUrl(defaultNetworks[network.id]);
            if (!defaultUrl) {
                throw new Error('Default URL not configured');
            }
            providers.push({
                provider: new ethers.JsonRpcProvider(
                    defaultUrl,
                    {
                        chainId: chainId,
                        name: network.name
                    },
                    options
                ),
                priority: 4,
                weight: 1,
                stallTimeout: 2000
            });
            console.log('✅ Added Default HTTP provider');
        } catch (e) {
            console.warn('❌ Default HTTP provider failed to initialize:', e.message);
        }
    }

    if (providers.length === 0) {
        throw new Error('No providers could be initialized');
    }
  
    // ✅ ROBUST FALLBACK CONFIGURATION
    const fallbackProvider = new ethers.FallbackProvider(
        providers.map(p => ({
            provider: p.provider,
            priority: p.priority,
            weight: p.weight,
            stallTimeout: p.stallTimeout
        })),
        chainId,
        {
            quorum: 1, // Only need 1 successful response
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
   
    return fallbackProvider;
}
