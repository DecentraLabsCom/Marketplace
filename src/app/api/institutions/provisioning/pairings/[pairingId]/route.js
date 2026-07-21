import { NextResponse } from 'next/server';
import {
  assertPairingBelongsToSession,
  pairingErrorResponse,
  requireProvisioningPairingSession,
} from '@/utils/auth/provisioningPairingRoutes';
import {
  cancelProvisioningPairing,
  publicProvisioningPairing,
} from '@/utils/auth/provisioningPairingStore';
import { provisioningPairingRateLimitResponse } from '@/utils/auth/provisioningPairingRateLimit';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const { pairingId } = await params;
    const sessionContext = await requireProvisioningPairingSession();
    const rateLimitResponse = await provisioningPairingRateLimitResponse(
      'status',
      _request,
      { ...sessionContext.session, institutionId: sessionContext.institutionId },
    );
    if (rateLimitResponse) return rateLimitResponse;
    const pairing = await assertPairingBelongsToSession(pairingId, sessionContext);
    return NextResponse.json(publicProvisioningPairing(pairing));
  } catch (error) {
    return pairingErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { pairingId } = await params;
    const sessionContext = await requireProvisioningPairingSession();
    const rateLimitResponse = await provisioningPairingRateLimitResponse(
      'cancel',
      request,
      { ...sessionContext.session, institutionId: sessionContext.institutionId },
    );
    if (rateLimitResponse) return rateLimitResponse;
    await assertPairingBelongsToSession(pairingId, sessionContext);
    await cancelProvisioningPairing(pairingId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return pairingErrorResponse(error);
  }
}
