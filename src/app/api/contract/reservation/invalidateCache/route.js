// Cache invalidation endpoint for when new reservations are made
// This ensures fresh data is fetched after blockchain state changes

import { invalidateCache } from '../cache';
import devLog from '@/utils/logger';

export async function POST(request) {
  try {
    const body = await request.json();
    const { reason = 'manual', reservationKey } = body || {};
    
    // Invalidate the shared cache
    const wasInvalidated = invalidateCache(reason);
    
    devLog.log('Cache invalidation requested:', { reason, reservationKey, wasInvalidated });
    
    return Response.json({ 
      success: true, 
      message: 'Cache invalidated successfully',
      wasInvalidated,
      reason,
      timestamp: new Date().toISOString()
    }, { status: 200 });
    
  } catch (error) {
    devLog.error('Error invalidating cache:', error);
    return Response.json({ 
      error: 'Failed to invalidate cache',
      details: error.message 
    }, { status: 500 });
  }
}
