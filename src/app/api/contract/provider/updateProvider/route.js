import { NextResponse } from 'next/server';
import { requireAuth, handleGuardError } from '@/utils/auth/guards';

/**
 * Update provider information
 * POST /api/contract/provider/updateProvider
 * 
 * Body Parameters:
 * @param {string} name - Provider name
 * @param {string} email - Provider email
 * @param {string} country - Provider country
 * @param {string} userAddress - Provider wallet address
 * 
 * @returns {Object} Success confirmation
 */
export async function POST(request) {
  try {
    // Authentication check - only authenticated users can update provider info
    // (on-chain contract verifies the caller is the provider themselves via PROVIDER_ROLE)
    await requireAuth();
    
    const { name, email, country, userAddress } = await request.json();

    if (!name || !email || !country || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, country, userAddress' }, {status: 400 }
      );
    }

    // Mutation must be executed by the provider wallet (signer) or via SSO intent flow
    return NextResponse.json({
      error: 'Update must be executed with wallet signature or SSO intent',
      hint: 'Wallet: call updateProvider on-chain with signer. SSO: use institutional intent flow.',
    }, {status: 400});

  } catch (error) {
    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }
    console.error('Error updating provider:', error);
    return NextResponse.json(
      { error: `Failed to update provider: ${error.message}` }, {status: 500 }
    );
  }
}
