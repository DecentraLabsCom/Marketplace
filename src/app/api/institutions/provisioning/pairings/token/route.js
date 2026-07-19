import { NextResponse } from 'next/server';
import {
  getProvisioningPairingByChallenge,
  isProvisioningPairingExpired,
  updateProvisioningPairing,
} from '@/utils/auth/provisioningPairingStore';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { challenge } = await request.json().catch(() => ({}));
    const pairing = await getProvisioningPairingByChallenge(challenge);
    if (!pairing || isProvisioningPairingExpired(pairing)) {
      return NextResponse.json({ error: 'Invalid or expired pairing challenge' }, { status: 410 });
    }
    if (pairing.status !== 'APPROVED' || !pairing.token) {
      return NextResponse.json({
        error: 'Pairing has not been approved yet',
        status: pairing.status,
      }, { status: 409 });
    }
    const updated = await updateProvisioningPairing(pairing.pairingId, {
      tokenRetrievedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      token: updated.token,
      payload: updated.tokenPayload,
      expiresAt: updated.tokenPayload?.expiresAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to retrieve provisioning token' }, { status: 400 });
  }
}
