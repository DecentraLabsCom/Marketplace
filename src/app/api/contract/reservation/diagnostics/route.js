// Diagnostic endpoint for monitoring RPC and cache status
// Useful for debugging RPC saturation issues

import { getCacheStats } from '../cache';
import { getContractInstance } from '../../utils/contractInstance';

export async function GET() {
  try {
    const cacheStats = getCacheStats();
    const now = new Date();
    
    // Test RPC connectivity
    let rpcStatus = 'unknown';
    let rpcLatency = null;
    let rpcError = null;
    
    try {
      const startTime = Date.now();
      const contract = await Promise.race([
        getContractInstance(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('RPC timeout')), 5000)
        )
      ]);
      
      // Quick test call
      await Promise.race([
        contract.totalReservations(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Contract call timeout')), 3000)
        )
      ]);
      
      rpcLatency = Date.now() - startTime;
      rpcStatus = rpcLatency < 2000 ? 'healthy' : 'slow';
    } catch (error) {
      rpcStatus = 'failed';
      rpcError = error.message;
    }
    
    const diagnostics = {
      timestamp: now.toISOString(),
      uptime: process.uptime(),
      rpc: {
        status: rpcStatus,
        latency: rpcLatency,
        error: rpcError
      },
      cache: cacheStats,
      recommendations: []
    };
    
    // Generate recommendations based on status
    if (rpcStatus === 'failed') {
      diagnostics.recommendations.push('RPC is failing - system will use cached/fallback data');
    } else if (rpcStatus === 'slow') {
      diagnostics.recommendations.push('RPC is slow - consider increasing cache duration');
    }
    
    if (!cacheStats.hasCache) {
      diagnostics.recommendations.push('No cached data available - first request will be slow');
    } else if (!cacheStats.isValid) {
      diagnostics.recommendations.push('Cache is stale - next request will refresh from blockchain');
    }
    
    return Response.json(diagnostics, { status: 200 });
    
  } catch (error) {
    return Response.json({
      error: 'Diagnostic check failed',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
