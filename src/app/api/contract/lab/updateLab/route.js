/**
 * API Route: /api/contract/lab/updateLab
 * Genera un intent EIP-712 para actualizar un lab y lo envía al gateway (si está configurado)
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
    const { labId, labData, gatewayUrl: gatewayUrlOverride } = body;
    
    if (!labId && labId !== 0) {
      return Response.json({ error: 'Missing required field: labId', field: 'labId' }, { status: 400 });
    }
    if (!labData) {
      return Response.json({ error: 'Missing required field: labData', field: 'labData' }, { status: 400 });
    }

    const { uri, price, auth, accessURI, accessKey } = labData;
    if (!uri) return Response.json({ error: 'Missing required field: uri', field: 'uri' }, { status: 400 });
    if (price === undefined || price === null) return Response.json({ error: 'Missing required field: price', field: 'price' }, { status: 400 });
    if (!auth) return Response.json({ error: 'Missing required field: auth', field: 'auth' }, { status: 400 });
    if (!accessURI) return Response.json({ error: 'Missing required field: accessURI', field: 'accessURI' }, { status: 400 });
    if (!accessKey) return Response.json({ error: 'Missing required field: accessKey', field: 'accessKey' }, { status: 400 });

    const numericLabId = Number(labId);
    if (Number.isNaN(numericLabId) || numericLabId < 0) {
      return Response.json({ error: 'Invalid lab ID format', field: 'labId', value: labId }, { status: 400 });
    }

    let priceInContractUnits;
    try {
      priceInContractUnits = BigInt(price.toString());
    } catch {
      return Response.json({ error: 'Invalid price format', field: 'price' }, { status: 400 });
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

    devLog.log('?? Building lab update intent via SSO:', { labId: numericLabId });

    const executorAddress = resolveIntentExecutorAddress();

    const intentPackage = await buildActionIntent({
      action: ACTION_CODES.LAB_UPDATE,
      executor: executorAddress,
      signer: executorAddress,
      schacHomeOrganization,
      assertionHash: computeAssertionHash(samlAssertion),
      puc: '',
      labId: numericLabId,
      uri,
      price: priceInContractUnits,
      auth,
      accessURI,
      accessKey
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
    devLog.error('? Error building lab update intent via SSO:', error);

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }

    return Response.json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Unexpected error while creating update intent',
      processingTime
    }, { status: 500 });
  }
}
