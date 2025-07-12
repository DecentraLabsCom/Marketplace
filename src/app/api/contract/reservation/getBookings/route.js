import { simBookings } from '@/utils/simBookings';
import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';

export async function GET(request) {
  // Support GET requests for fetching all bookings
  return handleRequest(null);
}

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  return handleRequest(wallet);
}

async function handleRequest(wallet) {
  // wallet can be null to fetch all bookings, or a specific address to filter by user

  try {
    console.log('Fetching bookings from contract...');
    const contract = await getContractInstance();
    console.log('Contract instance created successfully');

    // Get total number of reservations
    const totalReservations = await retry(() => contract.totalReservations());
    console.log('Total reservations:', totalReservations.toString());
    
    if (totalReservations === 0n) {
      console.log('No reservations found, returning empty array');
      return Response.json([], { status: 200 });
    }

    // Get all reservation keys
    const reservationKeys = [];
    for (let i = 0; i < totalReservations; i++) {
      const key = await retry(() => contract.reservationKeyByIndex(i));
      reservationKeys.push(key);
    }

    // Get reservation details for each key
    const allReservations = await Promise.all(
      reservationKeys.map(async (key) => {
        try {
          const reservation = await retry(() => contract.getReservation(key));
          return {
            reservationKey: key,
            labId: reservation.labId.toString(),
            renter: reservation.renter,
            price: reservation.price.toString(),
            start: reservation.start.toString(),
            end: reservation.end.toString(),
            status: reservation.status.toString()
          };
        } catch (error) {
          console.error(`Error getting reservation ${key}:`, error);
          return null;
        }
      })
    );

    // Filter out null results and filter by user if wallet provided
    let bookings = allReservations.filter(reservation => reservation !== null);
    
    if (wallet) {
      bookings = bookings.filter(reservation => 
        reservation.renter.toLowerCase() === wallet.toLowerCase()
      );
    }

    // Convert to the expected format for the frontend
    const formattedBookings = bookings.map(reservation => {
      const startTime = new Date(parseInt(reservation.start) * 1000);
      const endTime = new Date(parseInt(reservation.end) * 1000);
      const now = new Date();
      
      return {
        reservationKey: reservation.reservationKey,
        labId: reservation.labId,
        renter: reservation.renter,
        date: startTime.toISOString().split('T')[0], // YYYY-MM-DD format
        time: startTime.toTimeString().slice(0, 5), // HH:MM format
        minutes: Math.round((endTime - startTime) / (1000 * 60)), // Duration in minutes
        start: reservation.start,
        end: reservation.end,
        status: reservation.status,
        activeBooking: reservation.status === '1' && startTime <= now && endTime > now
      };
    });

    return Response.json(formattedBookings, { status: 200 });
  } catch (error) {
    console.error('Error fetching bookings from contract:', error);
    console.log('Falling back to simulated bookings...');
    try {
      const fallbackBookings = simBookings();
      console.log('Returning simulated bookings');
      return Response.json(fallbackBookings, { status: 200 });
    } catch (fallbackError) {
      console.error('Error fetching fallback bookings:', fallbackError);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
}