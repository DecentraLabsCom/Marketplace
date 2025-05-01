import { simBookings } from '../../../../../utils/simBookings';
import { getContractInstance } from '../../utils/contractInstance';

export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  if (!wallet) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // TODO - Remove when using contract
    throw new Error('Simulating error to get simulated bookings.');

    const contract = await getContractInstance();

    const bookingList = await contract.getAllBookings();

    // Filter to get only active and future bookings for user
    const bookings = await Promise.all(
        bookingList.map(async (booking) => {
            const renter = booking.renter.toString();
            const start = booking.start.toString();
            const end = booking.end.toString();
            const now = Date.now().toString();
            let activeBooking = false;
            const labId = booking.labId.toString();
            if (wallet == renter && start <= now && end > now) {
                activeBooking = true;
            }
            return {
              labId: labId,
              activeBooking: activeBooking,
              start: start,
              end: end,
          }
        })
    );

    // Return data to client
    return Response.json(bookings, { status: 200 });
  } catch (error) {
    try {
      const fallbackBookings = simBookings();
      return Response.json(fallbackBookings, { status: 200 });
    } catch (fallbackError) {
      console.error('Error fetching fallback bookings:', fallbackError);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
}