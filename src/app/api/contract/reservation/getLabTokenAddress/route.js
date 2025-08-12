import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Get LAB token contract address
 * GET /api/contract/reservation/getLabTokenAddress
 * 
 * @returns {Object} LAB token contract address
 */
export async function GET(request) {
  try {
    const contract = getContractInstance();

    // Call getLabTokenAddress function
    const result = await contract.getLabTokenAddress();

    return NextResponse.json({
      labTokenAddress: result
    }, {status: 200});

  } catch (error) {
    console.error('Error getting LAB token address:', error);
    return NextResponse.json(
      { error: `Failed to get LAB token address: ${error.message}` }, {status: 500 }
    );
  }
}



