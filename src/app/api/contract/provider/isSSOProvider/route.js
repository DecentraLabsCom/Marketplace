import devLog from '@/utils/dev/logger'

import { getContractInstance } from '../../utils/contractInstance'

export async function POST(request) {
  const body = await request.json();
  const { email } = body;
  
  if (!email) {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    // Get all providers and check if any have this email
    // Note: This is a simplified approach. In a real implementation, 
    // you might want to maintain a mapping of emails to provider IDs
    
    // For now, we'll check if there's a provider with this email
    // This would require extending the contract or maintaining an off-chain mapping
    // For the immediate solution, we'll assume the provider exists if they were registered via SSO
    
    // Get the total number of providers
    const providerCount = await contract.getProviderCount();
    let isProvider = false;
    
    // Check each provider (this is not efficient for large numbers, but works for now)
    for (let i = 1; i <= providerCount; i++) {
      try {
        const provider = await contract.getProvider(i);
        // provider structure: [name, wallet, email, country, isActive]
        if (provider[2].toLowerCase() === email.toLowerCase()) {
          isProvider = true;
          break;
        }
      } catch (error) {
        devLog.warn(`Failed to fetch provider ${i}:`, error.message);
        // Provider might not exist or be inactive, continue
        continue;
      }
    }

    return Response.json({ isLabProvider: isProvider }, { status: 200 });
  } catch (error) {
    devLog.error('Error checking SSO provider status:', error);
    return Response.json({ error: 'Failed to check provider status' }, { status: 500 });
  }
}
