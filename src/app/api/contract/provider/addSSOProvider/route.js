/**
 * API endpoint for adding SSO providers to the blockchain
 * Handles POST requests to register SSO users as providers using server wallet
 */

import { getContractInstance } from '../../utils/contractInstance'
import { executeBlockchainTransaction } from '@/app/api/contract/utils/retry'
import { ethers } from 'ethers'
import { validateProviderRole } from '@/utils/auth/roleValidation'

/**
 * Registers SSO user as provider on blockchain using server-managed wallet
 * @param {Request} request - HTTP request with provider data
 * @param {Object} request.body - Provider registration data
 * @param {string} request.body.name - Provider name (required)
 * @param {string} request.body.email - Provider email (required)
 * @param {string} request.body.affiliation - Provider affiliation/country
 * @param {string} request.body.role - User role for validation
 * @param {string} request.body.scopedRole - Scoped role for validation
 * @returns {Response} JSON response with registration result or error
 */
export async function POST(request) {
  const body = await request.json();
  const { name, email, affiliation, role, scopedRole } = body;
  
  if (!name || !email) {
    return Response.json({ error: 'Missing required fields (name, email)' }, { status: 400 });
  }

  // Server-side role validation for additional security
  const roleValidation = validateProviderRole(role, scopedRole);
  
  if (!roleValidation.isValid) {
    console.log(`Registration denied for role: "${role}", scopedRole: "${scopedRole}"`);
    return Response.json({ 
      error: roleValidation.reason 
    }, { status: 403 });
  }

  try {
    const contract = await getContractInstance();
    
    // For SSO users, we'll use the server wallet address as their provider address
    // This allows them to be registered on the blockchain while using SSO authentication
    const serverWallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
    const providerWallet = serverWallet.address;
    
    // Use affiliation as country if available, otherwise use a default
    const country = affiliation || 'Unknown';

    console.log(`Registering SSO provider: ${name} with server wallet: ${providerWallet}`);

    // Call contract with server-managed wallet address
    const tx = await executeBlockchainTransaction(() => contract.addProvider(name, providerWallet, email, country));
    await tx.wait();

    console.log(`SSO provider registered successfully: ${name}`);

    // Return success with the wallet address used
    return Response.json({ 
      success: true, 
      walletAddress: providerWallet,
      transactionHash: tx.hash 
    }, { status: 200 });
  } catch (error) {
    console.error('Error registering SSO provider:', error);
    return Response.json({ error: 'Failed to register provider' }, { status: 500 });
  }
}
