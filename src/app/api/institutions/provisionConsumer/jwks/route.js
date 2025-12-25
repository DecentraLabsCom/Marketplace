import { NextResponse } from 'next/server';
import { getProvisioningJwks } from '@/utils/auth/provisioningToken';
import devLog from '@/utils/dev/logger';

/**
 * JWKS endpoint for consumer provisioning token RS256 validation
 * GET /api/institutions/provisionConsumer/jwks
 * Returns JWK Set with public key (same as provider provisioning token)
 */
export const runtime = 'nodejs';

export async function GET() {
  try {
    const jwks = await getProvisioningJwks();
    return NextResponse.json(jwks);
  } catch (error) {
    devLog.error('[API] provisionConsumer/jwks: failed to serve JWKS', error);
    return NextResponse.json({ error: 'Unable to serve provisioning JWKS' }, { status: 500 });
  }
}
