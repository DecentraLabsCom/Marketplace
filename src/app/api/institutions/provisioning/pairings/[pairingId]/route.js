import { NextResponse } from 'next/server';
import {
  assertPairingBelongsToSession,
  pairingErrorResponse,
  requireProvisioningPairingSession,
} from '@/utils/auth/provisioningPairingRoutes';
import { publicProvisioningPairing } from '@/utils/auth/provisioningPairingStore';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const sessionContext = await requireProvisioningPairingSession();
    const pairing = await assertPairingBelongsToSession(params.pairingId, sessionContext);
    return NextResponse.json(publicProvisioningPairing(pairing));
  } catch (error) {
    return pairingErrorResponse(error);
  }
}
