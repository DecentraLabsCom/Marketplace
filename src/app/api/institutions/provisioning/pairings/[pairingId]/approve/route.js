import { NextResponse } from 'next/server';
import { signProvisioningToken, normalizeHttpsUrl } from '@/utils/auth/provisioningToken';
import { getProvisioningRegistryConfig } from '@/utils/auth/provisioningTypedData';
import {
  assertPairingBelongsToSession,
  pairingErrorResponse,
  requireProvisioningPairingSession,
} from '@/utils/auth/provisioningPairingRoutes';
import { recordProvisioningTokenIssued } from '@/utils/auth/provisioningReplayStore';
import { publicProvisioningPairing, transitionProvisioningPairing } from '@/utils/auth/provisioningPairingStore';
import { inferCountryFromDomain } from '@/utils/country/inferCountryFromDomain';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const sessionContext = await requireProvisioningPairingSession();
    const pairing = await assertPairingBelongsToSession(params.pairingId, sessionContext);
    if (pairing.status !== 'AWAITING_APPROVAL') {
      return NextResponse.json({ error: 'Pairing is not awaiting approval' }, { status: 409 });
    }
    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || new URL(request.url).origin,
      'Marketplace base URL',
    );
    const { chainId, registryContract } = getProvisioningRegistryConfig();
    const providerName = pairing.providerName || pairing.institutionId.split('.')[0].toUpperCase();
    const providerEmail = pairing.providerEmail || sessionContext.session.email || sessionContext.session.mail;
    const providerCountry = pairing.providerCountry || inferCountryFromDomain(pairing.institutionId)
      || process.env.PROVISIONING_DEFAULT_COUNTRY || 'ES';
    const configuredTokenTtl = Number.parseInt(process.env.PROVISIONING_TOKEN_TTL_SECONDS || '', 10);
    const tokenTtl = Number.isSafeInteger(configuredTokenTtl) && configuredTokenTtl > 0
      ? Math.min(900, configuredTokenTtl)
      : 300;
    const claims = {
      marketplaceBaseUrl,
      institutionId: pairing.institutionId,
      walletAddress: pairing.walletAddress,
      canonicalBackendOrigin: pairing.canonicalBackendOrigin,
      registrationType: pairing.registrationType,
      chainId,
      registryContract,
      providerName,
      providerEmail,
      providerCountry,
      consumerName: pairing.consumerName || providerName,
      responsiblePerson: sessionContext.session.name || providerEmail,
      responsibleEmail: providerEmail,
      issuedBy: sessionContext.session.id || sessionContext.session.eduPersonPrincipalName || providerEmail,
    };
    const signed = await signProvisioningToken(claims, {
      issuer: marketplaceBaseUrl,
      audience: pairing.canonicalBackendOrigin,
      ttlSeconds: tokenTtl,
    });
    await recordProvisioningTokenIssued(signed.payload);
    const updated = await transitionProvisioningPairing(pairing.pairingId, 'AWAITING_APPROVAL', {
      status: 'APPROVED',
      chainId,
      registryContract,
      token: signed.token,
      tokenPayload: signed.payload,
      approvedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      ...publicProvisioningPairing(updated),
      status: 'APPROVED',
      tokenExpiresAt: signed.expiresAt,
    });
  } catch (error) {
    return pairingErrorResponse(error);
  }
}
