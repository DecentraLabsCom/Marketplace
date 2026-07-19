import { NextResponse } from 'next/server';
import { getProvisioningRegistryConfig } from '@/utils/auth/provisioningTypedData';
import {
  getProvisioningPairingByChallenge,
  isProvisioningPairingExpired,
} from '@/utils/auth/provisioningPairingStore';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { challenge } = await request.json().catch(() => ({}));
    const pairing = await getProvisioningPairingByChallenge(challenge);
    if (!pairing || isProvisioningPairingExpired(pairing)) {
      return NextResponse.json({ error: 'Invalid or expired pairing challenge' }, { status: 410 });
    }
    if (pairing.status !== 'AWAITING_BACKEND') {
      return NextResponse.json({ error: 'Pairing challenge is no longer awaiting a backend' }, { status: 409 });
    }
    const { chainId, registryContract } = getProvisioningRegistryConfig();
    return NextResponse.json({
      pairingId: pairing.pairingId,
      challenge: challenge.toLowerCase(),
      institutionId: pairing.institutionId,
      registrationType: pairing.registrationType,
      chainId,
      registryContract,
      issuedAt: pairing.issuedAt,
      expiresAt: pairing.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid pairing challenge' }, { status: 400 });
  }
}
