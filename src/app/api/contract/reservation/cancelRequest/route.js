import { ethers } from 'ethers';
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { isVercel } from '@/utils/isVercel';

export async function POST(request) {
  try {
    const body = await request.json();
    const { reservationKey, userAddress } = body;
    
    if (!reservationKey) {
      return Response.json({ error: 'Missing reservationKey' }, { status: 400 });
    }

    if (!userAddress) {
      return Response.json({ error: 'Missing userAddress' }, { status: 400 });
    }

    console.log('Validating cancel reservation request for reservationKey:', reservationKey);

    // Validate reservationKey format (should be bytes32)
    if (!reservationKey.startsWith('0x') || reservationKey.length !== 66) {
      return Response.json({ error: 'Invalid reservationKey format' }, { status: 400 });
    }

    // Set up provider
    const RPC_URLS = [
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
      `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`,
      'https://rpc.sepolia.org',
      'https://rpc2.sepolia.org',
      'https://ethereum-sepolia-rpc.publicnode.com'
    ].filter(Boolean);

    const providers = RPC_URLS.map(url => new ethers.JsonRpcProvider(url));
    const provider = new ethers.FallbackProvider(providers, null, { quorum: 1, cacheTimeout: 30000 });
    
    // Get contract
    const contractAddress = contractAddresses.sepolia;
    if (!contractAddress) {
      return Response.json({ error: 'Contract address not configured for this network' }, { status: 500 });
    }
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // Get reservation details
    const reservation = await contract.getReservation(reservationKey);
    console.log('Reservation details:', reservation);

    // Check if reservation exists
    if (!reservation.exists) {
      return Response.json({ error: 'Reservation does not exist' }, { status: 404 });
    }

    // Check reservation status (should be PENDING for cancelReservationRequest)
    if (reservation.status !== 0) { // 0 = PENDING
      return Response.json({ 
        error: 'Only PENDING reservations can be canceled with cancelReservationRequest' 
      }, { status: 400 });
    }

    // Check if already canceled
    if (reservation.status === 4) { // 4 = CANCELLED
      return Response.json({ error: 'Reservation is already canceled' }, { status: 400 });
    }

    // Check authorization
    if (reservation.renter.toLowerCase() !== userAddress.toLowerCase()) {
      return Response.json({ error: 'Unauthorized: You are not the renter of this reservation' }, { status: 403 });
    }

    // All validations passed
    return Response.json({ 
      success: true,
      message: 'Cancellation request validated - proceed with cancelReservationRequest transaction',
      reservationKey,
      reservationStatus: reservation.status
    }, { status: 200 });

  } catch (error) {
    console.error('Error validating cancel reservation request:', error);
    
    return Response.json({ 
      error: 'Failed to validate request cancellation',
      details: error.message 
    }, { status: 500 });
  }
}
