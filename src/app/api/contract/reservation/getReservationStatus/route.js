import devLog from '@/utils/logger';

import { getContractInstance } from '../../utils/contractInstance';

export async function POST(request) {
  const body = await request.json();
  const { reservationKey } = body;
  
  if (!reservationKey) {
    return Response.json({ error: 'Missing reservation key' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    // Get reservation status from contract
    const reservation = await Promise.race([
      contract.getReservation(reservationKey),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getReservation timeout')), 10000)
      )
    ]);
    
    if (!reservation) {
      return Response.json({ 
        error: 'Reservation not found',
        reservationKey 
      }, { status: 404 });
    }
    
    // Parse reservation data
    const reservationData = {
      key: reservationKey,
      labId: reservation.labId.toString(),
      user: reservation.user,
      start: reservation.start.toString(),
      end: reservation.end.toString(),
      status: reservation.status, // This should indicate if confirmed/denied/pending
      createdAt: reservation.createdAt ? reservation.createdAt.toString() : null,
      processedAt: reservation.processedAt ? reservation.processedAt.toString() : null
    };
    
    return Response.json({ 
      success: true,
      reservation: reservationData
    });
    
  } catch (error) {
    devLog.error('Error getting reservation status:', error);
    return Response.json({ 
      error: 'Failed to get reservation status',
      details: error.message 
    }, { status: 500 });
  }
}
