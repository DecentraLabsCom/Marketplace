import { simBookings } from '../../../../utils/simBookings';
import { getContractInstance } from '../utils/contractInstance';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.body;
  if (!wallet) {
    res.status(200).json([]);
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
    res.status(200).json(bookings);
  } catch (error) {
    try {
      const fallbackBookings = simBookings();
      res.status(200).json(fallbackBookings);
    } catch (fallbackError) {
      console.error('Error fetching fallback bookings:', fallbackError);
      res.status(500).json({ error: 'Failed to fetch bookings and fallback' });
    }
  }
}