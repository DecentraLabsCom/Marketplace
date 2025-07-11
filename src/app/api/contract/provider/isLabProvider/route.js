import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  if (!wallet) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();

    const isLabProvider = await retry(() => contract.isLabProvider(wallet));
    
    return Response.json({isLabProvider}, { status: 200 });
  } catch (error) {
    console.error('Error when trying to check provider status:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}