/**
 * API endpoint for adding SSO providers to the blockchain
 * Handles POST requests to register SSO users as providers using server wallet
 */

import { getContractInstance } from '../../utils/contractInstance'
import { validateProviderRole, hasAdminRole } from '@/utils/auth/roleValidation'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

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
  try {
    // Authentication check - only authenticated SSO users can register providers
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  const body = await request.json();
  const { name, email, affiliation, role, scopedRole, walletAddress } = body;
  
  if (!name || !email) {
    return Response.json({ error: 'Missing required fields (name, email)' }, { status: 400 });
  }

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) {
    return Response.json({ error: 'A valid walletAddress is required to register the institution as provider' }, { status: 400 });
  }

  // Server-side role validation for additional security
  const roleValidation = validateProviderRole(role, scopedRole);
  const adminAllowed = hasAdminRole(role, scopedRole);
  
  if (!roleValidation.isValid || !adminAllowed) {
    console.log(`Institutional provider registration denied for role: "${role}", scopedRole: "${scopedRole}"`);
    return Response.json({ 
      error: roleValidation.reason || 'Your institutional role does not allow registering the institution as a provider. Only staff, employees, or faculty are eligible.'
    }, { status: 403 });
  }

  try {
    const contract = await getContractInstance('diamond', false);
    
    // Use affiliation as country if available, otherwise use a default
    const country = affiliation || 'Unknown';

    console.log(`Registering SSO institution provider: ${name} with institutional wallet: ${walletAddress}`);

    // Call contract with institutional wallet address; transaction is signed by server wallet
    const tx = await contract.addProvider(name, walletAddress, email, country);
    await tx.wait();

    console.log(`SSO provider registered successfully: ${name}`);

    // Return success with the wallet address used
    return Response.json({ 
      walletAddress: walletAddress,
      transactionHash: tx.hash 
    }, { status: 200 });
  } catch (error) {
    console.error('Error registering SSO provider:', error);
    return Response.json({ error: 'Failed to register provider' }, { status: 500 });
  }
}
