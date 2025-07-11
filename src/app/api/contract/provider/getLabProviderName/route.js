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
    const providerList = await retry(() => contract.getLabProviders());

    const provider = providerList.find(
      (p) => p.account.toLowerCase() === wallet.toLowerCase()
    );

    if (provider) {
      return Response.json({ name: provider.base.name }, { status: 200 });
    } else {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error when trying to check provider status:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}