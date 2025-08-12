import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

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

    const contract = getContractInstance();

    // Call listToken function
    const result = await contract.listToken(labId, { from: userAddress });

    return NextResponse.json({
      transactionHash: result.hash,
      labId: labId,
      message: 'Token listed successfully'
    }, {status: 200});

  } catch (error) {
    console.error('Error listing token:', error);
    return NextResponse.json(
      { error: `Failed to list token: ${error.message}` }, {status: 500 }
    );
  }
}
