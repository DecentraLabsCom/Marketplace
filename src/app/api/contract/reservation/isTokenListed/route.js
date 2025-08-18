import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Check if token is listed for reservation
 * GET /api/contract/reservation/isTokenListed?labId=123
 * 
 * Query Parameters:
 * @param {number|string} labId - Lab ID (token ID)
 * 
 * @returns {Object} Token listing status
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

    const contract = getContractInstance();

    // Call isTokenListed function
    const result = await contract.isTokenListed(labId);

    return NextResponse.json({
      labId: labId,
      isListed: result
    }, {status: 200});

  } catch (error) {
    console.error('Error checking if token is listed:', error);
    return NextResponse.json(
      { error: `Failed to check if token is listed: ${error.message}` }, {status: 500 }
    );
  }
}



