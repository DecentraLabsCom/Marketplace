import { NextResponse } from 'next/server';
import {
  getProvisioningPairingByChallenge,
  redeemProvisioningPairingToken,
} from '@/utils/auth/provisioningPairingStore';
import { provisioningPairingRateLimitResponse } from '@/utils/auth/provisioningPairingRateLimit';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const rateLimitResponse = await provisioningPairingRateLimitResponse('token', request);
    if (rateLimitResponse) return rateLimitResponse;
    const { challenge } = await request.json().catch(() => ({}));
    const pairing = await getProvisioningPairingByChallenge(challenge);
    const tokenExpiresAt = Number(pairing?.tokenExpiresAt || pairing?.tokenPayload?.expiresAt || 0);
    if (!pairing || !tokenExpiresAt || tokenExpiresAt <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: 'Invalid or expired pairing challenge' }, { status: 410 });
    }
    if (pairing.status !== 'APPROVED' || !pairing.token) {
      return NextResponse.json({
        error: 'Pairing has not been approved yet',
        status: pairing.status,
      }, { status: 409 });
    }
    const redemption = await redeemProvisioningPairingToken(pairing);
    return NextResponse.json({
      token: redemption.token,
      payload: redemption.payload,
      expiresAt: redemption.expiresAt,
      tokenExpiresAt: redemption.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || 'Unable to retrieve provisioning token',
        code: error.code || 'PAIRING_TOKEN_RETRIEVAL_FAILED',
      },
      { status: Number.isInteger(error?.status) ? error.status : 400 },
    );
  }
}
