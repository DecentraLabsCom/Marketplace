/**
 * Get reservation keys for a given lab and user (paginated)
 * Maps to contract.getReservationsOfTokenByUserPaginated(tokenId, user, offset, limit)
 * 
 * Query params:
 * - labId (required)
 * - userAddress (required)
 * - offset (optional, default 0)
 * - limit (optional, default 50, max 100)
 */

import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const labIdParam = searchParams.get('labId');
    const userAddress = searchParams.get('userAddress');
    const offsetParam = searchParams.get('offset') ?? '0';
    const limitParam = searchParams.get('limit') ?? '50';

    if (!labIdParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: labId' },
        { status: 400 },
      );
    }
    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing required parameter: userAddress' },
        { status: 400 },
      );
    }

    const labId = Number(labIdParam);
    const offset = Number(offsetParam);
    const limit = Number(limitParam);

    if (Number.isNaN(labId) || labId < 0) {
      return NextResponse.json(
        { error: 'Invalid labId format - must be a non-negative number' },
        { status: 400 },
      );
    }
    if (Number.isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid offset format - must be a non-negative number' },
        { status: 400 },
      );
    }
    if (Number.isNaN(limit) || limit <= 0 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit - must be between 1 and 100' },
        { status: 400 },
      );
    }

    const contract = await getContractInstance();
    const [keys, total] = await contract.getReservationsOfTokenByUserPaginated(
      labId,
      userAddress,
      offset,
      limit,
    );

    const serializedKeys = Array.isArray(keys)
      ? keys.map((k) => k.toString())
      : [];

    return NextResponse.json({
      labId,
      userAddress,
      offset,
      limit,
      total: Number(total ?? 0),
      keys: serializedKeys,
    });
  } catch (error) {
    console.error('Error getting reservations of token by user:', error);
    return NextResponse.json(
      {
        error: 'Failed to get reservations of token by user',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
