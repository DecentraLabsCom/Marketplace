/**
 * API Route: /api/contract/lab/deleteLab
 * Genera intent EIP-712 para borrar un lab y lo envía al gateway (si está configurado)
 * para que sea firmado/ejecutado por el backend institucional.
 */

import devLog from '@/utils/dev/logger';
import { requireAuth, requireLabOwner, handleGuardError } from '@/utils/auth/guards';
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent';
import { resolveIntentExecutorAddress } from '@/utils/intents/resolveIntentExecutor';

export async function POST(request) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { labId, gatewayUrl: gatewayUrlOverride } = body;
    
    if (!labId && labId !== 0) {
      return Response.json({ error: 'Missing required field: labId', field: 'labId' }, { status: 400 });
    }

    const numericLabId = Number(labId);
    if (Number.isNaN(numericLabId) || numericLabId < 0) {
      return Response.json({ error: 'Invalid lab ID format', field: 'labId', value: labId }, { status: 400 });
    }

    const session = await requireAuth();
    await requireLabOwner(session, numericLabId);

    const schacHomeOrganization = session.schacHomeOrganization || session.organization || session.organizationName;
    const samlAssertion = session.samlAssertion;
    if (!schacHomeOrganization) {
      return Response.json({ error: 'Missing schacHomeOrganization in session', code: 'MISSING_SESSION_FIELDS' }, { status: 400 });
    }
    if (!samlAssertion) {
      return Response.json({ error: 'Missing SAML assertion in session', code: 'MISSING_SAML' }, { status: 400 });
    }

    devLog.log('?? Building lab delete intent via SSO:', { labId: numericLabId });

    const executorAddress = resolveIntentExecutorAddress();

    const intentPackage = await buildActionIntent({
      action: ACTION_CODES.LAB_DELETE,
      executor: executorAddress,
      signer: executorAddress,
      schacHomeOrganization,
      assertionHash: computeAssertionHash(samlAssertion),
      puc: '',
      labId: numericLabId,
    });

    const processingTime = Date.now() - startTime;

    const intentForTransport = JSON.parse(JSON.stringify(intentPackage, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    const gatewayUrl = gatewayUrlOverride || process.env.INSTITUTION_GATEWAY_URL;
    let dispatched = false;
    let dispatchError = null;

    if (gatewayUrl) {
      try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/intents/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meta: intentForTransport.meta,
            payload: intentForTransport.payload,
            payloadHash: intentForTransport.payloadHash,
            typedData: intentForTransport.typedData,
            samlAssertion,
          }),
        });
        dispatched = res.ok;
        if (!res.ok) {
          dispatchError = `Gateway responded with status ${res.status}`;
        }
      } catch (err) {
        dispatchError = err?.message || 'Failed to dispatch intent to gateway';
      }
    } else {
      dispatchError = 'No gateway URL configured; intent returned for manual dispatch';
    }

    return Response.json({
      success: true,
      status: dispatched ? 'dispatched' : 'queued',
      dispatched,
      dispatchError,
      intent: intentForTransport,
      samlAssertion: dispatched ? undefined : samlAssertion,
      timestamp: new Date().toISOString(),
      processingTime
    }, { status: dispatched ? 200 : 202 });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    devLog.error('? Error building lab delete intent via SSO:', error);

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }

    return Response.json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Unexpected error while creating delete intent',
      processingTime
    }, { status: 500 });
  }
}
