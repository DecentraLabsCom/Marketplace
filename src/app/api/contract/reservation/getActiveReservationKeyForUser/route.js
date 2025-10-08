import { getContractInstance } from '../../utils/contractInstance'

/**
 * Retrieves the active reservation key for a user in a specific lab
 * Uses O(1) contract lookup via interval tree
 * 
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to check (required)
 * @param {string} request.searchParams.userAddress - User address to check (required)
 * @returns {Response} JSON response with reservation key or 0x0 if no active booking
 */
export async function GET(request) {
  const url = new URL(request.url);
  const labId = url.searchParams.get('labId');
  const userAddress = url.searchParams.get('userAddress');
  
  // Validate required parameters
  if (!labId) {
    return Response.json({ 
      error: 'Missing labId parameter' 
    }, { status: 400 });
  }

  if (!userAddress) {
    return Response.json({ 
      error: 'Missing userAddress parameter' 
    }, { status: 400 });
  }

  // Validate address format
  if (!userAddress.startsWith('0x') || userAddress.length !== 42) {
    return Response.json({ 
      error: 'Invalid userAddress format - must be Ethereum address (0x + 40 hex chars)',
      providedAddress: userAddress 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching active reservation key for user ${userAddress.slice(0, 6)}...${userAddress.slice(-4)} in lab ${labId}`);
    
    const contract = await getContractInstance();

    // Call contract function
    const reservationKey = await contract.getActiveReservationKeyForUser(labId, userAddress);

    // bytes32(0) means no active booking
    const isZeroKey = reservationKey === '0x0000000000000000000000000000000000000000000000000000000000000000';
    
    if (isZeroKey) {
      console.log(`✅ No active reservation found for user in lab ${labId}`);
    } else {
      console.log(`✅ Found active reservation: ${reservationKey.slice(0, 10)}...${reservationKey.slice(-8)}`);
    }

    return Response.json({ 
      reservationKey,
      hasActiveBooking: !isZeroKey,
      labId,
      userAddress
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Error fetching active reservation key:', error);
    
    // Handle contract revert gracefully
    if (error.code === 'CALL_EXCEPTION' || 
        error.message?.includes('reverted') ||
        error.message?.includes('execution reverted')) {
      console.log(`⚠️ Contract call reverted for lab ${labId}, user ${userAddress}`);
      
      // Return zero key (no active booking) instead of error
      return Response.json({ 
        reservationKey: '0x0000000000000000000000000000000000000000000000000000000000000000',
        hasActiveBooking: false,
        labId,
        userAddress,
        note: 'No active booking or lab not found'
      }, { status: 200 });
    }
    
    // For other errors, return 500
    return Response.json({ 
      error: 'Failed to fetch active reservation key',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      labId,
      userAddress
    }, { status: 500 });
  }
}
