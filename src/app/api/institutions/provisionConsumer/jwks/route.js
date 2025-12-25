import { NextResponse } from 'next/server';
import provisioningToken from '@/lib/auth/provisioningToken';

/**
 * JWKS endpoint for consumer provisioning token RS256 validation
 * GET /api/institutions/provisionConsumer/jwks
 * Returns JWK Set with public key (same as provider provisioning token)
 */
export async function GET() {
  try {
    const jwks = provisioningToken.getJWKS();
    return NextResponse.json(jwks, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[provisionConsumer/jwks] Failed to generate JWKS:', error);
    return NextResponse.json(
      { error: 'Failed to generate JWKS' },
      { status: 500 }
    );
  }
}
