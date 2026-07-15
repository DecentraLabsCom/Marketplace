/**
 * API endpoint for retrieving a specific reservation by key
 * Handles GET requests to fetch individual reservation data
 * Optimized for React Query client-side caching - no server-side cache
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import devLog from '@/utils/dev/logger'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'

/**
 * Retrieves a specific reservation by its key
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.reservationKey - Reservation key (bytes32 format, required)
 * @returns {Response} JSON response with reservation data or error
 */
export async function GET(request) {
  try {
    // Authentication check - reservation data requires login
    await requireAuth();
  } catch (error) {
    return handleGuardError(error, request);
  }

  const url = new URL(request.url);
  const reservationKey = url.searchParams.get('reservationKey');
  
  if (!reservationKey) {
    return Response.json({ 
      error: 'Missing reservationKey parameter' 
    }, {status: 400 });
  }

  // Validate reservationKey format (should be bytes32)
  if (!reservationKey.startsWith('0x') || reservationKey.length !== 66) {
    return Response.json({ 
      error: 'Invalid reservationKey format - must be bytes32 (0x + 64 hex chars)',
      providedKey: reservationKey 
    }, {status: 400 });
  }

  try {
    console.log(`🔍 Fetching reservation: ${reservationKey.slice(0, 10)}...${reservationKey.slice(-8)}`);
    
    const contract = await getContractInstance();

    // Get reservation data from contract
    const reservationData = await contract.getReservation(reservationKey);

    // Contract returns: { labId, renter, price, labProvider, status, start, end, puc,
    //   requestPeriodStart, requestPeriodDuration, payerInstitution, collectorInstitution,
    //   providerShare }
    // Status: 0=PENDING, 1=CONFIRMED, 2=ACCESS_AUTHORIZED, 3=COLLECTED, 4=CANCELLED
    const status = Number(reservationData.status);
    const renterAddress = reservationData.renter || '0x0000000000000000000000000000000000000000';
    const labProviderAddress = reservationData.labProvider || '0x0000000000000000000000000000000000000000';
    const payerInstitutionAddress = reservationData.payerInstitution || '0x0000000000000000000000000000000000000000';
    const collectorInstitutionAddress = reservationData.collectorInstitution || '0x0000000000000000000000000000000000000000';
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    const sentinelAddress = '0x0000000000000000000000000000000000000001';
    const exists = renterAddress !== zeroAddress;

    // Guard against legacy/corrupted reservations that decode with impossible fields
    const invalidReservation =
      labProviderAddress === zeroAddress ||
      renterAddress === zeroAddress ||
      renterAddress === sentinelAddress;
    const effectiveExists = exists && !invalidReservation;

    // Determine reservation state
    let reservationState = 'Unknown';
    let isConfirmed = false;
    
    if (!effectiveExists) {
      reservationState = 'Not Found';
    } else {
      switch (status) {
        case 0:
          reservationState = 'Pending';
          isConfirmed = false;
          break;
        case 1:
          reservationState = 'Confirmed';
          isConfirmed = true;
          break;
        case 2:
          reservationState = 'Access Authorized';
          isConfirmed = true;
          break;
        case 3:
          reservationState = 'Collected';
          isConfirmed = true;
          break;
        case 4:
          reservationState = 'Cancelled';
          isConfirmed = false;
          break;
        default:
          reservationState = 'Unknown Status';
      }
    }

    devLog.log(`✅ Successfully fetched reservation: ${reservationState} (labId=${reservationData.labId?.toString?.() || 'n/a'})`);

    return Response.json({ 
      reservation: {
        labId: reservationData.labId?.toString() || null,
        renter: renterAddress,
        price: reservationData.price?.toString() || null,
        labProvider: labProviderAddress,
        start: reservationData.start?.toString() || null,
        end: reservationData.end?.toString() || null,
        status: status,
        puc: reservationData.puc || '',
        requestPeriodStart: reservationData.requestPeriodStart?.toString() || null,
        requestPeriodDuration: reservationData.requestPeriodDuration?.toString() || null,
        payerInstitution: payerInstitutionAddress,
        collectorInstitution: collectorInstitutionAddress,
        providerShare: reservationData.providerShare?.toString() || null,
        reservationState: reservationState,
        isPending: status === 0,
        isBooked: status === 1,
        isAccessAuthorized: status === 2,
        isCollected: status === 3,
        isCanceled: status === 4,
        isActive: status === 1 || status === 2, // Reservation can be active when confirmed or access-authorized
        isCompleted: status === 3, // Collected/settled terminal state
        isConfirmed: isConfirmed,
        exists: effectiveExists,
        isInstitutional: payerInstitutionAddress !== '0x0000000000000000000000000000000000000000'
      },
      reservationKey,
      notFound: !effectiveExists,
      invalidReservation
    }, {status: 200});

  } catch (error) {
    console.error('❌ Error fetching reservation:', error);

    // Gracefully handle decoding failures from mismatched ABI/contract
    if (error.code === 'BAD_DATA' || error.shortMessage?.includes('could not decode result data') || error.message?.includes('could not decode result data')) {
      console.warn(`⚠️ Reservation decode failed, treating as not found: ${reservationKey.slice(0, 10)}...${reservationKey.slice(-8)}`);
      return Response.json({
        reservation: {
          labId: null,
          renter: '0x0000000000000000000000000000000000000000',
          price: null,
          labProvider: '0x0000000000000000000000000000000000000000',
          start: null,
          end: null,
          status: null,
          puc: '',
          requestPeriodStart: null,
          requestPeriodDuration: null,
          payerInstitution: '0x0000000000000000000000000000000000000000',
          collectorInstitution: '0x0000000000000000000000000000000000000000',
          providerShare: null,
          projectTreasuryShare: null,
          subsidiesShare: null,
          governanceShare: null,
          reservationState: 'Not Found',
          isPending: false,
          isBooked: false,
          isAccessAuthorized: false,
          isCollected: false,
          isCanceled: false,
          isActive: false,
          isCompleted: false,
          isConfirmed: false,
          exists: false,
          isInstitutional: false
        },
        reservationKey,
        notFound: true,
        decodeFailed: true
      }, { status: 200 });
    }
    
    // Handle contract revert gracefully - treat as non-existent reservation
    if (error.code === 'CALL_EXCEPTION' || 
        error.message?.includes('reverted') ||
        error.message?.includes('execution reverted')) {
      console.log(`⚠️ Reservation not found or reverted: ${reservationKey.slice(0, 10)}...${reservationKey.slice(-8)}`);
      
      // Return a valid response indicating the reservation doesn't exist
      return Response.json({ 
        reservation: {
          labId: null,
          renter: '0x0000000000000000000000000000000000000000',
          price: null,
          labProvider: '0x0000000000000000000000000000000000000000',
          start: null,
          end: null,
          status: null,
          puc: '',
          requestPeriodStart: null,
          requestPeriodDuration: null,
          payerInstitution: '0x0000000000000000000000000000000000000000',
          collectorInstitution: '0x0000000000000000000000000000000000000000',
          providerShare: null,
          projectTreasuryShare: null,
          subsidiesShare: null,
          governanceShare: null,
          reservationState: 'Not Found',
          isPending: false,
          isBooked: false,
          isAccessAuthorized: false,
          isCollected: false,
          isCanceled: false,
          isActive: false,
          isCompleted: false,
          isConfirmed: false,
          exists: false,
          isInstitutional: false
        },
        reservationKey,
        notFound: true
      }, {status: 200}); // Return 200 with notFound flag instead of 500
    }
    
    // For other errors, return 500
    return publicErrorResponse({
      status: 500,
      code: 'RESERVATION_FETCH_FAILED',
      message: 'The reservation could not be loaded.',
      error,
      context: 'contract-get-reservation',
    });
  }
}
