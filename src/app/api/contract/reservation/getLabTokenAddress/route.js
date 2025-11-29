import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
import { requireAuth, handleGuardError } from '@/utils/auth/guards';

/**
 * Get LAB token contract address
 * GET /api/contract/reservation/getLabTokenAddress
 * 
 * @security Protected - requires authenticated session
 * @returns {Object} LAB token contract address
 */
export async function GET(request) {
  try {
    // Authentication check - contract technical data requires login
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

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



