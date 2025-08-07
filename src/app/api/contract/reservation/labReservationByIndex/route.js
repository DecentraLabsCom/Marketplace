import { NextResponse } from 'next/server'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '../../utils/retry'
import { devLog } from '@/utils/dev/logger'

/**
 * GET /api/contract/reservation/labReservationByIndex
 * Get a lab reservation key by index (atomic endpoint)
 * Returns only the reservation key - use getReservation endpoint for full details
 */
export async function GET(request) {
  let labId, index;
  
  try {
    const { searchParams } = new URL(request.url)
    labId = searchParams.get('labId')
    index = searchParams.get('index')

    // Validation
    if (!labId) {
      return NextResponse.json(
        { error: 'Lab ID is required' },
        { 
          status: 400,
          headers: { 'Cache-Control': 'no-cache' }
        }
      )
    }

    if (index === null || index === undefined) {
      return NextResponse.json(
        { error: 'Index is required' },
        { 
          status: 400,
          headers: { 'Cache-Control': 'no-cache' }
        }
      )
    }

    const numericLabId = Number(labId)
    if (isNaN(numericLabId) || numericLabId < 0) {
      return NextResponse.json(
        { error: 'Invalid labId format - must be a positive number' },
        { 
          status: 400,
          headers: { 'Cache-Control': 'no-cache' }
        }
      )
    }

    const indexNum = parseInt(index)
    if (isNaN(indexNum) || indexNum < 0) {
      return NextResponse.json(
        { error: 'Index must be a non-negative number' },
        { 
          status: 400,
          headers: { 'Cache-Control': 'no-cache' }
        }
      )
    }

    devLog.log(`🔧 [API] 🔑 Getting reservation key for lab ${labId} at index ${indexNum}`)

    // Get contract instance
    const contract = await getContractInstance()
    
    // ATOMIC: Single contract call to get reservation key by index
    const reservationKey = await retryBlockchainRead(
      () => contract.getReservationOfTokenByIndex(numericLabId, indexNum),
      `get reservation key ${indexNum} for lab ${labId}`
    )

    devLog.log(`✅ [API] Got reservation key for lab ${labId} at index ${indexNum}: ${reservationKey.toString().slice(0, 10)}...${reservationKey.toString().slice(-8)}`)

    return NextResponse.json({
      reservationKey: reservationKey.toString(),
      labId: numericLabId,
      index: indexNum
    }, {
      headers: { 'Cache-Control': 'no-cache' }
    })

  } catch (error) {
    devLog.error(`❌ [API] Error getting reservation key for lab ${labId || 'unknown'} at index ${index || 'unknown'}:`, error)
    
    return NextResponse.json(
      { 
        error: 'Failed to get lab reservation key by index',
        message: error.message,
        retryable: true
      },
      { 
        status: 500,
        headers: { 'Cache-Control': 'no-cache' }
      }
    )
  }
}
