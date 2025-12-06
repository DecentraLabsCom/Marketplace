import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
/**
 * Get token URI for a lab
 * GET /api/contract/lab/getTokenURI?labId=123
 * 
 * Query Parameters:
 * @param {number|string} labId - Lab ID
 * 
 * @returns {Object} Token URI information
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const labId = searchParams.get('labId');

    if (!labId) {
      return NextResponse.json(
        { error: 'Missing required parameter: labId' }, {status: 400 }
      );
    }

    const contract = await getContractInstance();

    // Call tokenURI function
    const tokenURI = await contract.tokenURI(labId);

    return NextResponse.json({
      labId: labId,
      tokenURI: tokenURI
    }, {status: 200});

  } catch (error) {
    console.error('Error getting token URI:', error);
    return NextResponse.json(
      { error: `Failed to get token URI: ${error.message}` }, {status: 500 }
    );
  }
}
