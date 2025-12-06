import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Check if time slot is available for reservation
 * GET /api/contract/reservation/checkAvailable?labId=123&start=1698234567&end=1698320967
 * 
 * Query Parameters:
 * @param {number|string} labId - Lab ID
 * @param {number|string} start - Start timestamp
 * @param {number|string} end - End timestamp
 * 
 * @returns {Object} Availability status
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const labId = searchParams.get('labId');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!labId || !start || !end) {
      return NextResponse.json(
        { error: 'Missing required parameters: labId, start, end' }, {status: 400 }
      );
    }

    const contract = await getContractInstance();

    // Call checkAvailable function
    const result = await contract.checkAvailable(labId, start, end);

    return NextResponse.json({
      labId: labId,
      start: start,
      end: end,
      isAvailable: result
    }, {status: 200});

  } catch (error) {
    console.error('Error checking availability:', error);
    return NextResponse.json(
      { error: `Failed to check availability: ${error.message}` }, {status: 500 }
    );
  }
}


