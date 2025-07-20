import devLog from '@/utils/logger';

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

    const tx = await retry(() => contract.removeProvider(wallet));
    await tx.wait();

    // Return data to client
    return Response.json({succsess: true}, { status: 200 });
  } catch (error) {
    devLog.error('Error when trying to delete a provider:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
