import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';

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
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}