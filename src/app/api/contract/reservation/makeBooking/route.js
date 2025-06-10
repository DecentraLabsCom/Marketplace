import { getContractInstance } from '../../utils/contractInstance';
import retry from '../../../../../utils/retry';

export async function POST(request) {
  const body = await request.json();
  const { labId, start, timeslot } = body;
  if (!labId || !start || !timeslot) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const end = start + timeslot;

  try {
    const contract = await getContractInstance();

    console.log(`Attempting to call reservationRequest for labId: ${labId}, start: ${start}, end (calculated): ${end}`);

    // Call contract
    const tx = await retry(() => contract.reservationRequest(labId, start, end));
    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.transactionHash);

    // Return data to client
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error when trying to book the lab:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}