/**
 * API endpoint for removing lab providers from the blockchain
 * Handles POST requests to deregister providers from the smart contract
 */
import { getContractInstance } from '../../utils/contractInstance'
/**
 * Removes a lab provider from the blockchain registry
 * @param {Request} request - HTTP request with provider details
 * @param {Object} request.body - Request body
 * @param {string} request.body.wallet - Provider's wallet address to remove (required)
 * @returns {Response} JSON response with removal result or error
 */
export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  if (!wallet) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();

    const tx = await contract.removeProvider(wallet);
    await tx.wait();

    // Return data to client
    return Response.json({
      message: 'Provider removed successfully',
      walletAddress: wallet
    }, { status: 200 });
  } catch (error) {
    console.error('Error when trying to delete a provider:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
