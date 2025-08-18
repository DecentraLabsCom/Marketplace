import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
// 
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
    console.error('Error setting token URI:', error);
    return NextResponse.json(
      { error: `Failed to set token URI: ${error.message}` }, {status: 500 }
    );
  }
}
