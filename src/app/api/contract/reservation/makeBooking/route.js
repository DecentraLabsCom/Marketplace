import { getContractInstance } from '../../utils/contractInstance';

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  if (!wallet) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check other required params (labId...) are also provided

  try {
    const contract = await getContractInstance();

    // Call contract
    // ...

    // Return data to client
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error when trying to book the lab:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}