import { NextResponse } from 'next/server';
import { getProvisioningRegistryConfig } from '@/utils/auth/provisioningTypedData';
import {
  recoverProvisioningPairingWalletAddress,
  validateProvisioningPairingClaims,
} from '@/utils/auth/provisioningPairingTypedData';
import {
  getProvisioningPairingByChallenge,
  isProvisioningPairingExpired,
  publicProvisioningPairing,
  transitionProvisioningPairing,
} from '@/utils/auth/provisioningPairingStore';
import { provisioningPairingRateLimitResponse } from '@/utils/auth/provisioningPairingRateLimit';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const rateLimitResponse = await provisioningPairingRateLimitResponse('offer', request);
    if (rateLimitResponse) return rateLimitResponse;
    const body = await request.json().catch(() => ({}));
    const pairing = await getProvisioningPairingByChallenge(body?.challenge);
    if (!pairing || isProvisioningPairingExpired(pairing)) {
      return NextResponse.json({ error: 'Invalid or expired pairing challenge' }, { status: 410 });
    }
    if (pairing.status !== 'AWAITING_BACKEND') {
      return NextResponse.json({ error: 'Pairing challenge has already been offered' }, { status: 409 });
    }

    const { chainId, registryContract } = getProvisioningRegistryConfig();
    const claims = validateProvisioningPairingClaims({
      institutionId: pairing.institutionId,
      walletAddress: body?.walletAddress,
      canonicalBackendOrigin: body?.canonicalBackendOrigin,
      registrationType: pairing.registrationType,
      chainId,
      registryContract,
      challenge: body?.challenge,
      issuedAt: pairing.issuedAt,
      expiresAt: pairing.expiresAt,
    }, {
      registrationType: pairing.registrationType,
      chainId,
      registryContract,
      challenge: body?.challenge,
    });
    const signer = recoverProvisioningPairingWalletAddress(claims, body?.walletSignature);
    if (signer.toLowerCase() !== claims.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Pairing wallet signature mismatch' }, { status: 401 });
    }

    const updated = await transitionProvisioningPairing(pairing.pairingId, 'AWAITING_BACKEND', {
      status: 'AWAITING_APPROVAL',
      chainId,
      registryContract,
      walletAddress: claims.walletAddress,
      canonicalBackendOrigin: claims.canonicalBackendOrigin,
      walletSignature: body.walletSignature,
      offeredAt: new Date().toISOString(),
    });
    return NextResponse.json(publicProvisioningPairing(updated));
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid pairing offer',
      code: error?.code || 'PAIRING_OFFER_INVALID',
    }, { status: error?.status === 409 ? 409 : 400 });
  }
}
