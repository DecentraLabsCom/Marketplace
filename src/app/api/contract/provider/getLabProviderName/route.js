import devLog from '@/utils/logger';
import { getContractInstance } from '../../utils/contractInstance';

// Retry function with exponential backoff
async function retryWithBackoff(fn, maxRetries = 2, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      devLog.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  if (!wallet) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    const startTime = Date.now();
    devLog.log(`🔍 Getting lab provider name for wallet: ${wallet}`);
    
    // Retry with backoff for better reliability
    const providerList = await retryWithBackoff(async () => {
      return await Promise.race([
        contract.getLabProviders(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getLabProviders timeout')), 15000) // Increased to 20s
        )
      ]);
    });

    const elapsedTime = Date.now() - startTime;
    devLog.log(`✅ getLabProviders completed in ${elapsedTime}ms`);

    const provider = providerList.find(
      (p) => p.account.toLowerCase() === wallet.toLowerCase()
    );

    if (provider) {
      devLog.log(`✅ Found provider name: ${provider.base.name} for wallet: ${wallet}`);
      return Response.json({ name: provider.base.name }, { status: 200 });
    } else {
      devLog.log(`ℹ️ Provider not found for wallet: ${wallet}`);
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }
  } catch (error) {
    devLog.error('Error when trying to get provider name:', error);
    
    // If it's a timeout, try to provide more context
    if (error.message.includes('timeout')) {
      devLog.error(`❌ Timeout occurred for wallet: ${wallet}, consider increasing timeout or checking network`);
    }
    
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
