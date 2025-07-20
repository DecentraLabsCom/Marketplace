import devLog from '@/utils/logger';

export async function POST(request) {
  try {
    const body = await request.json();
    const { reservationKey } = body;
    
    if (!reservationKey) {
      return Response.json({ error: 'Missing reservationKey' }, { status: 400 });
    }

    devLog.log('Cancel booking request for reservationKey:', reservationKey);

    // Validate reservationKey format (should be bytes32)
    if (!reservationKey.startsWith('0x') || reservationKey.length !== 66) {
      return Response.json({ error: 'Invalid reservationKey format' }, { status: 400 });
    }

    // Return success - the actual transaction will be done from frontend
    return Response.json({ 
      success: true,
      message: 'Cancellation request validated',
      reservationKey: reservationKey
    }, { status: 200 });

  } catch (error) {
    devLog.error('Error processing cancel booking request:', error);
    
    return Response.json({ 
      error: 'Failed to process cancellation request',
      details: error.message 
    }, { status: 500 });
  }
}
