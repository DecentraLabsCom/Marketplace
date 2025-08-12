import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Get safe balance of LAB tokens in contract
 * GET /api/contract/reservation/getSafeBalance
 * 
 * @returns {Object} Safe balance of LAB tokens
 */
export async function GET(request) {
  try {
    const contract = getContractInstance();

    // Call getSafeBalance function
    const result = await contract.getSafeBalance();

    return NextResponse.json({
      safeBalance: result.toString()
    }, {status: 200});

  } catch (error) {
    console.error('Error getting safe balance:', error);
    return NextResponse.json(
      { error: `Failed to get safe balance: ${error.message}` }, {status: 500 }
    );
  }
}



