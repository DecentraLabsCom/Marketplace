import devLog from '@/utils/dev/logger';

import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import { ethers } from 'ethers';
import { validateProviderRole } from '@/utils/auth/roleValidation';

export async function POST(request) {
  const body = await request.json();
  const { name, email, affiliation, role, scopedRole } = body;
  
  if (!name || !email) {
    return Response.json({ error: 'Missing required fields (name, email)' }, { status: 400 });
  }

  // Server-side role validation for additional security
  const roleValidation = validateProviderRole(role, scopedRole);
  
  if (!roleValidation.isValid) {
    devLog.log(`Registration denied for role: "${role}", scopedRole: "${scopedRole}"`);
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

    devLog.log(`Registering SSO provider: ${name} with server wallet: ${providerWallet}`);

    // Call contract with server-managed wallet address
    const tx = await retry(() => contract.addProvider(name, providerWallet, email, country));
    await tx.wait();

    devLog.log(`SSO provider registered successfully: ${name}`);

    // Return success with the wallet address used
    return Response.json({ 
      success: true, 
      walletAddress: providerWallet,
      transactionHash: tx.hash 
    }, { status: 200 });
  } catch (error) {
    devLog.error('Error registering SSO provider:', error);
    return Response.json({ error: 'Failed to register provider' }, { status: 500 });
  }
}
