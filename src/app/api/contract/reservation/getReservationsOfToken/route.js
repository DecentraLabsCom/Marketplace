import { NextResponse } from 'next/server'
import { getContractInstance } from '../../utils/contractInstance'
import { devLog } from '@/utils/dev/logger'

/**
 * GET /api/contract/reservation/labReservationCount
 * Get the number of reservations for a lab (atomic endpoint)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const labId = searchParams.get('labId')

    // Validation
    if (!labId) {
      return NextResponse.json(
        { error: 'Lab ID is required' }, {status: 400,
          
        }
      )
    }

    const numericLabId = Number(labId)
    if (isNaN(numericLabId) || numericLabId < 0) {
      return NextResponse.json(
        { error: 'Invalid labId format - must be a positive number' }, {status: 400,
          
        }
      )
    }

    devLog.log(`🔧 [API] 📊 Getting reservation count for lab: ${labId}`)

    // Get contract instance
    const contract = await getContractInstance()
    
    // Get reservation count
    const count = await contract.getReservationsOfToken(numericLabId)

    const reservationCount = Number(count)
    devLog.log(`✅ [API] Lab ${labId} has ${reservationCount} reservations`)

    return NextResponse.json({
      count: reservationCount,
      labId: numericLabId
    }, {})

  } catch (error) {
    devLog.error('❌ [API] Error getting lab reservation count:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to get lab reservation count',
        message: error.message,
        retryable: true
      }, {status: 500,
        
      }
    )
  }
}
