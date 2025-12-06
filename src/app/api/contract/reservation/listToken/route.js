import { NextResponse } from 'next/server';

/**
 * List token for reservation
 * POST /api/contract/lab/listToken
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
        error: 'Listing must be executed with a wallet signature or SSO intent',
        hint: 'Wallet: call contract.listToken with signer. SSO: use /api/contract/lab/listLab intent endpoint.',
      },
      { status: 400 },
    );

  } catch (error) {
    console.error('Error listing token:', error);
    return NextResponse.json(
      { error: `Failed to list token: ${error.message}` }, {status: 500 }
    );
  }
}
