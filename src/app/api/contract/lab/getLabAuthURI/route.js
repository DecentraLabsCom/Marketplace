import { NextResponse } from 'next/server'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import devLog from '@/utils/dev/logger'

/**
 * GET /api/contract/lab/getLabAuthURI
 * 
 * Retrieves the authentication URI for a lab by resolving it from the provider.
 * The authURI is now stored at the provider level, not per lab.
 * 
 * @query {string|number} labId - The unique identifier of the lab
 * @returns {Object} Response with authURI or error
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const labId = searchParams.get('labId');

  if (!labId) {
    return NextResponse.json({ error: 'Missing required parameter: labId' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    // Call the new contract function that resolves authURI from provider
    const authURI = await contract.getLabAuthURI(labId);

    return NextResponse.json({ authURI }, { status: 200 });
  } catch (error) {
    devLog.error('Error fetching lab authURI:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch lab authURI' },
      { status: 500 }
    );
  }
}
