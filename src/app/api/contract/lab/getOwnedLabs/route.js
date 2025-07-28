/**
 * API endpoint for retrieving labs owned by a specific wallet address
 * Handles GET requests to fetch user-owned lab data
 * Optimized for React Query client-side caching - no server-side cache
 */
import { isAddress } from 'viem'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'
import { createSerializedJsonResponse } from '@/app/api/contract/utils/bigIntSerializer'
import { getContractInstance } from '../../utils/contractInstance'

/**
 * Retrieves labs owned by a specific wallet address
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.wallet - Wallet address to check ownership for (required)
 * @returns {Response} JSON response with owned labs array or error
 */
export async function GET(request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');
  
  if (!wallet) {
    return Response.json({ 
      error: 'Missing wallet parameter' 
    }, { status: 400 });
  }

  if (!isAddress(wallet)) {
    return Response.json({ 
      error: 'Invalid wallet address format' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching owned labs for wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    // Get all lab IDs first
    const labList = await retryBlockchainRead(() => contract.getAllLabs());

    const ownedLabs = [];
    
    // Check ownership for each lab (parallel processing)
    const ownershipChecks = labList.map(async (lab) => {
      const labId = lab.labId.toString();
      
      try {
        const owner = await retryBlockchainRead(() => contract.ownerOf(labId));
        
        if (owner.toLowerCase() === wallet.toLowerCase()) {
          let name = `Lab ${labId}`;
          
          // Fetch metadata with timeout
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(lab.base.uri, { 
              signal: controller.signal 
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const metadata = await response.json();
              name = metadata?.name ?? name;
            }
          } catch (metadataError) {
            console.warn(`Failed to fetch metadata for lab ${labId}:`, metadataError.message);
          }
          
          return {
            id: labId,
            name,
            uri: lab.base.uri
          };
        }
        
        return null;
      } catch (error) {
        console.warn(`Failed to check ownership for lab ${labId}:`, error.message);
        return null;
      }
    });

    // Wait for all ownership checks to complete
    const results = await Promise.allSettled(ownershipChecks);
    
    // Collect successful owned labs
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        ownedLabs.push(result.value);
      }
    });

    console.log(`✅ Found ${ownedLabs.length} owned labs for wallet`);

    return createSerializedJsonResponse({ 
      ownedLabs,
      count: ownedLabs.length,
      wallet 
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    console.error('❌ Error fetching owned labs:', error);
    
    return Response.json({ 
      error: 'Failed to fetch owned labs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      wallet 
    }, { status: 500 });
  }
}
