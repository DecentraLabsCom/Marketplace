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
    devLog.log(`🔍 Checking isLabProvider for wallet: ${wallet}`);

    // Retry with backoff for better reliability
    const isLabProvider = await retryWithBackoff(async () => {
      return await Promise.race([
        contract.isLabProvider(wallet),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('isLabProvider timeout')), 12000) // Reduced to 12s for faster failures
        )
      ]);
    });
    
    const elapsedTime = Date.now() - startTime;
    devLog.log(`✅ isLabProvider completed in ${elapsedTime}ms for wallet: ${wallet}`);
    
    return Response.json({isLabProvider}, { status: 200 });
  } catch (error) {
    devLog.error('Error when trying to check provider status:', error);
    
    // If it's a timeout, try to provide more context
    if (error.message.includes('timeout')) {
      devLog.error(`❌ Timeout occurred for wallet: ${wallet}, consider increasing timeout or checking network`);
    }
    
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
