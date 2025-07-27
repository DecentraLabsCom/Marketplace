/**
 * API endpoint for registering new lab providers on the blockchain
 * Handles POST requests to add provider information to the smart contract
 */
import devLog from '@/utils/dev/logger'

import { getContractInstance } from '../../utils/contractInstance'
import retry from '@/utils/retry'

/**
 * Registers a new lab provider on the blockchain
 * @param {Request} request - HTTP request with provider details
 * @param {Object} request.body - Request body
 * @param {string} request.body.name - Provider's full name (required)
 * @param {string} request.body.email - Provider's email address (required)
 * @param {string} request.body.wallet - Provider's wallet address (required)
 * @param {string} request.body.country - Provider's country (required)
 * @returns {Response} JSON response with registration result or error
 */
export async function POST(request) {
  const body = await request.json();
  const { name, email, wallet, country  } = body;
  if (!name || !email || !wallet || !country) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();

    // Call contract
    const tx = await retry(() => contract.addProvider(name, wallet, email, country));
    await tx.wait();

    // Return ok signal to client
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    devLog.error('Error adding provider:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
