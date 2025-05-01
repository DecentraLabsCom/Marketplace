import { getContractInstance } from '../../utils/contractInstance';

export async function POST(request) {
  const body = await request.json();
  const { wallet, labId } = body;
  if (!wallet || !labId) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check other required params are also provided

  try {
    const contract = await getContractInstance();

    // Call contract
    // ...

    // Return data to client
    return Response.json([], { status: 200 });
  } catch (error) {
    console.error('Error when trying to list a lab:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}