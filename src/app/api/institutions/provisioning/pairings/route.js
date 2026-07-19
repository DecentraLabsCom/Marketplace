import { NextResponse } from 'next/server';
import { PROVISIONING_REGISTRATION_TYPES } from '@/utils/auth/provisioningTypedData';
import {
  createPairingForSession,
  pairingErrorResponse,
  requireProvisioningPairingSession,
} from '@/utils/auth/provisioningPairingRoutes';
import { provisioningPairingRateLimitResponse } from '@/utils/auth/provisioningPairingRateLimit';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const sessionContext = await requireProvisioningPairingSession();
    const rateLimitResponse = await provisioningPairingRateLimitResponse(
      'create',
      request,
      { ...sessionContext.session, institutionId: sessionContext.institutionId },
    );
    if (rateLimitResponse) return rateLimitResponse;
    const body = await request.json().catch(() => ({}));
    const registrationType = body?.registrationType;
    if (!Object.values(PROVISIONING_REGISTRATION_TYPES).includes(registrationType)) {
      return NextResponse.json({ error: 'registrationType must be provider or consumer' }, { status: 400 });
    }
    return NextResponse.json(await createPairingForSession(registrationType, sessionContext), { status: 201 });
  } catch (error) {
    return pairingErrorResponse(error);
  }
}
