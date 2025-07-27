import devLog from '@/utils/dev/logger';

import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';

export async function POST(request) {
  const body = await request.json();
  const { labId, start, timeslot } = body;
  if (!labId || !start || !timeslot) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const end = start + timeslot;

  try {
    const contract = await getContractInstance();

    devLog.log(`Attempting to call reservationRequest for labId: ${labId}, 
      start: ${start}, end (calculated): ${end}`);

    // Call contract
    const tx = await retry(() => contract.reservationRequest(labId, start, end));
    devLog.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    devLog.log('Transaction confirmed:', receipt.transactionHash);

    // The BookingEventContext will automatically handle the ReservationRequested event

    // Return data to client
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    devLog.error('Error when trying to book the lab:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
