/**
 * API endpoint for getting provider details by ID
 * Handles GET requests to fetch provider information by index
 * Atomic endpoint - only calls getProvider contract method
 */

import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Gets provider details by provider ID
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.providerId - Provider ID/index (required)
 * @returns {Response} JSON response with provider details or error
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');
    
    if (!providerId) {
      return Response.json({ 
        error: 'Missing providerId parameter' 
      }, { status: 400 });
    }

    // Validate providerId is a number
    const providerIndex = Number(providerId);
    if (isNaN(providerIndex) || providerIndex < 1) {
      return Response.json({ 
        error: 'Invalid providerId - must be a positive number' 
      }, { status: 400 });
    }

    console.log(`🔍 Fetching provider details for ID: ${providerIndex}`);
    
    const contract = await getContractInstance();
    const provider = await retryBlockchainRead(() => contract.getProvider(providerIndex));
    
    // Provider structure: [name, wallet, email, country, isActive]
    const providerData = {
      id: providerIndex,
      name: provider[0],
      wallet: provider[1],
      email: provider[2],
      country: provider[3],
      isActive: provider[4]
    };

    console.log(`✅ Provider details for ID ${providerIndex}:`, providerData);

    return Response.json({ 
      success: true,
      provider: providerData
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    console.error('❌ Error fetching provider details:', error);
    
    // Handle case where provider doesn't exist
    if (error.message?.includes('revert') || error.message?.includes('invalid')) {
      return Response.json({ 
        error: 'Provider not found',
        providerId: Number(new URL(request.url).searchParams.get('providerId'))
      }, { status: 404 });
    }
    
    return Response.json({ 
      error: 'Failed to fetch provider details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
