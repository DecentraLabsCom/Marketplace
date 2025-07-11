import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import { ethers } from 'ethers';

export async function POST(request) {
  const body = await request.json();
  const { reservationKey, labId, start, end } = body;
  
  console.log('Processing reservation request:', { reservationKey, labId, start, end });
  
  if (!reservationKey || !labId || !start || !end) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    // Get lab information to check if the reservation is within allowed dates
    const labInfo = await retry(() => contract.getLab(labId));
    
    if (!labInfo) {
      console.log(`Lab ${labId} not found, denying reservation`);
      await denyReservation(contract, reservationKey, 'Lab not found');
      return Response.json({ 
        success: true, 
        action: 'denied',
        reason: 'Lab not found'
      });
    }
    
    // Parse lab dates (assuming they are Unix timestamps in seconds)
    const labOpens = parseInt(labInfo.base.opens.toString());
    const labCloses = parseInt(labInfo.base.closes.toString());
    
    // Convert start and end to numbers if they're strings
    const reservationStart = parseInt(start);
    const reservationEnd = parseInt(end);
    
    console.log('Date validation:', {
      labOpens: new Date(labOpens * 1000).toISOString(),
      labCloses: new Date(labCloses * 1000).toISOString(),
      reservationStart: new Date(reservationStart * 1000).toISOString(),
      reservationEnd: new Date(reservationEnd * 1000).toISOString()
    });
    
    // Check if reservation is within lab operating dates
    if (reservationStart >= labOpens && reservationEnd <= labCloses) {
      console.log('Reservation is within allowed dates, confirming...');
      await confirmReservation(contract, reservationKey);
      return Response.json({ 
        success: true, 
        action: 'confirmed',
        reason: 'Reservation within allowed dates'
      });
    } else {
      console.log('Reservation is outside allowed dates, denying...');
      let reason = 'Reservation outside allowed dates';
      if (reservationStart < labOpens) {
        reason = 'Reservation starts before lab opens';
      } else if (reservationEnd > labCloses) {
        reason = 'Reservation ends after lab closes';
      }
      
      await denyReservation(contract, reservationKey, reason);
      return Response.json({ 
        success: true, 
        action: 'denied',
        reason: reason
      });
    }
    
  } catch (error) {
    console.error('Error processing reservation request:', error);
    
    // In case of error, try to deny the reservation to prevent it from being stuck
    try {
      const contract = await getContractInstance();
      await denyReservation(contract, reservationKey, 'Processing error');
    } catch (denyError) {
      console.error('Failed to deny reservation after error:', denyError);
    }
    
    return Response.json({ 
      error: 'Failed to process reservation request',
      details: error.message 
    }, { status: 500 });
  }
}

async function confirmReservation(contract, reservationKey) {
  try {
    console.log(`Confirming reservation with key: ${reservationKey}`);
    const tx = await retry(() => contract.confirmReservationRequest(reservationKey));
    await tx.wait();
    console.log(`Reservation confirmed: ${tx.hash}`);
    return tx.hash;
  } catch (error) {
    console.error('Error confirming reservation:', error);
    throw error;
  }
}

async function denyReservation(contract, reservationKey, reason) {
  try {
    console.log(`Denying reservation with key: ${reservationKey}, reason: ${reason}`);
    const tx = await retry(() => contract.denyReservationRequest(reservationKey));
    await tx.wait();
    console.log(`Reservation denied: ${tx.hash}`);
    return tx.hash;
  } catch (error) {
    console.error('Error denying reservation:', error);
    throw error;
  }
}
