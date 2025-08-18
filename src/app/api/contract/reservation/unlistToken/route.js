import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

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

    const contract = getContractInstance();

    // Call unlistToken function
    const result = await contract.unlistToken(labId, { from: userAddress });

    return NextResponse.json({
      transactionHash: result.hash,
      labId: labId,
      message: 'Token unlisted successfully'
    }, {status: 200});

  } catch (error) {
    console.error('Error unlisting token:', error);
    return NextResponse.json(
      { error: `Failed to unlist token: ${error.message}` }, {status: 500 }
    );
  }
}


