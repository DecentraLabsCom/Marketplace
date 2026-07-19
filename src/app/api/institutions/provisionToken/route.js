import { NextResponse } from 'next/server';
import {
  createPairingForSession,
  pairingErrorResponse,
  requireProvisioningPairingSession,
} from '@/utils/auth/provisioningPairingRoutes';

export const runtime = 'nodejs';

/**
 * Compatibility path for provider onboarding. It now creates a pairing
 * challenge; wallet and backend values are never accepted from the browser.
 */
export async function POST(request) {
  try {
    const sessionContext = await requireProvisioningPairingSession();
    const pairing = await createPairingForSession('provider', sessionContext);
    return NextResponse.json(pairing, { status: 201 });
  } catch (error) {
    return pairingErrorResponse(error);
  }
}
