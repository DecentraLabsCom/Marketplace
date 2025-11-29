/**
 * API endpoint for removing lab providers from the blockchain
 * Handles POST requests to deregister providers from the smart contract
 * Requires admin privileges (DEFAULT_ADMIN_ROLE on-chain)
 */
import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError, ForbiddenError } from '@/utils/auth/guards'
import { hasAdminRole } from '@/utils/auth/roleValidation'

/**
 * Removes a lab provider from the blockchain registry
 * @param {Request} request - HTTP request with provider details
 * @param {Object} request.body - Request body
 * @param {string} request.body.wallet - Provider's wallet address to remove (required)
 * @returns {Response} JSON response with removal result or error
 */
export async function POST(request) {
  try {
    // Authentication check - only authenticated users with admin role can remove providers
    const session = await requireAuth();
    
    // Admin role check - this operation requires DEFAULT_ADMIN_ROLE on-chain
    if (!hasAdminRole(session.role, session.scopedRole)) {
      throw new ForbiddenError('Admin privileges required to remove providers');
    }
    
    const body = await request.json();
    const { wallet } = body;
    if (!wallet) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const contract = await getContractInstance();

    const tx = await contract.removeProvider(wallet);
    await tx.wait();

    // Return data to client
    return Response.json({
      message: 'Provider removed successfully',
      walletAddress: wallet
    }, { status: 200 });
  } catch (error) {
    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }
    console.error('Error when trying to delete a provider:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
