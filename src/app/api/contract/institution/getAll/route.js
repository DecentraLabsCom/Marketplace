/**
 * API endpoint for retrieving all registered institutions
 * Returns paginated list of institutions registered in the contract
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

/**
 * Retrieves all registered institutions (paginated)
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.offset - Pagination offset (default: 0)
 * @param {string} request.searchParams.limit - Number of results (default: 100)
 * @returns {Response} JSON response with institutions list
 */
export async function GET(request) {
  try {
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);

  if (isNaN(offset) || offset < 0) {
    return Response.json({ 
      error: 'Invalid offset parameter' 
    }, { status: 400 });
  }

  if (isNaN(limit) || limit < 1 || limit > 500) {
    return Response.json({ 
      error: 'Invalid limit parameter (must be 1-500)' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching institutions (offset: ${offset}, limit: ${limit})`);
    
    const contract = await getContractInstance();
    
    const [institutions, total] = await contract.getInstitutionsPaginated(offset, limit);
    
    console.log(`✅ Successfully fetched ${institutions.length} institutions (total: ${total})`);
    
    return Response.json({ 
      institutions: institutions.map(addr => addr.toString()),
      total: Number(total),
      offset,
      limit
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Error fetching institutions:', error);
    
    return Response.json({ 
      error: 'Failed to fetch institutions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    }, { status: 500 });
  }
}
