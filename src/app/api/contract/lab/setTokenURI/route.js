import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
import { requireAuth, requireLabOwner, handleGuardError } from '@/utils/auth/guards';

/**
 * Set token URI for a lab
 * POST /api/contract/lab/setTokenURI
 * 
 * Body Parameters:
 * @param {number|string} labId - Lab ID
 * @param {string} tokenURI - URI for the lab token metadata
 * @param {string} userAddress - Provider wallet address
 * 
 * @returns {Object} Success confirmation
 */
export async function POST(request) {
  try {
    const { labId, tokenURI, userAddress } = await request.json();

    if (!labId || !tokenURI || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: labId, tokenURI, userAddress' }, {status: 400 }
      );
    }

    // Authentication and authorization - only lab owner can set token URI
    const session = await requireAuth();
    await requireLabOwner(session, labId);

    const contract = getContractInstance();

    // Call setTokenURI function
    const result = await contract.setTokenURI(labId, tokenURI, { from: userAddress });

    return NextResponse.json({
      transactionHash: result.hash,
      labId: labId,
      tokenURI: tokenURI,
      message: 'Token URI set successfully'
    }, {status: 200});

  } catch (error) {
    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }
    console.error('Error setting token URI:', error);
    return NextResponse.json(
      { error: `Failed to set token URI: ${error.message}` }, {status: 500 }
    );
  }
}
