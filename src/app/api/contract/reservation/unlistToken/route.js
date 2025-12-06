import { NextResponse } from 'next/server';

/**
 * Unlist token from reservation system
 * POST /api/contract/lab/unlistToken
 * 
 * Body Parameters:
 * @param {number|string} labId - Lab ID (token ID)
 * @param {string} userAddress - Provider wallet address
 * 
 * @returns {Object} Success confirmation
 */
export async function POST(request) {
  try {
    const { labId, userAddress } = await request.json();

    if (!labId || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: labId, userAddress' }, {status: 400 }
      );
    }

    // This action must be executed by the wallet signer (for providers) or via SSO intent endpoints.
    return NextResponse.json(
      {
        error: 'Unlisting must be executed with a wallet signature or SSO intent',
        hint: 'Wallet: call contract.unlistToken with signer. SSO: use /api/contract/lab/unlistLab intent endpoint.',
      },
      { status: 400 },
    );

  } catch (error) {
    console.error('Error unlisting token:', error);
    return NextResponse.json(
      { error: `Failed to unlist token: ${error.message}` }, {status: 500 }
    );
  }
}


