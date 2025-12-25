import { NextResponse } from 'next/server';
import { getProvisioningJwks } from '@/utils/auth/provisioningToken';
import devLog from '@/utils/dev/logger';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const jwks = await getProvisioningJwks();
    return NextResponse.json(jwks);
  } catch (error) {
    devLog.error('[API] provisionToken/jwks: failed to serve JWKS', error);
    return NextResponse.json({ error: 'Unable to serve provisioning JWKS' }, { status: 500 });
  }
}
