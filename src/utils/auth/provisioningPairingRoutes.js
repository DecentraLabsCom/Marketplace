import { NextResponse } from 'next/server';
import { requireAuth, ForbiddenError, HttpError } from '@/utils/auth/guards';
import { hasInstitutionRegistrationPrivilege } from '@/utils/auth/roleValidation';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import { inferCountryFromDomain } from '@/utils/country/inferCountryFromDomain';
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain';
import {
  createProvisioningPairing,
  getProvisioningPairing,
  isProvisioningPairingExpired,
  publicProvisioningPairing,
} from '@/utils/auth/provisioningPairingStore';

export async function requireProvisioningPairingSession() {
  const session = await requireAuth();
  if (!session?.samlAssertion) throw new ForbiddenError('Provisioning pairing requires SSO session');
  if (!hasInstitutionRegistrationPrivilege(session)) {
    throw new ForbiddenError(
      'Provisioning pairing requires an institutional administrator entitlement or a faculty, staff, or employee SSO affiliation',
    );
  }
  const institutionCandidate = resolveInstitutionDomainFromSession(session);
  if (!institutionCandidate) throw new ForbiddenError('Cannot derive institution domain from the SSO session');
  return {
    session,
    institutionId: marketplaceJwtService.normalizeOrganizationDomain(institutionCandidate),
  };
}

export async function createPairingForSession(registrationType, sessionContext) {
  const { session, institutionId } = sessionContext;
  const issuedAt = Math.floor(Date.now() / 1000);
  const configuredTtl = Number.parseInt(process.env.PROVISIONING_PAIRING_TTL_SECONDS || '', 10);
  const ttlSeconds = Number.isSafeInteger(configuredTtl) && configuredTtl > 0
    ? Math.min(configuredTtl, 900)
    : 600;
  const expiresAt = issuedAt + ttlSeconds;
  const domainLabel = institutionId.split('.')[0]?.toUpperCase() || institutionId;
  const providerEmail = session.email || session.mail || null;
  if (registrationType === 'provider' && !providerEmail) {
    throw new ForbiddenError('Provider pairing requires an email claim in the verified SSO session');
  }
  const country = session.country || session.countryCode || session.organizationCountry
    || session.organizationCountryCode || inferCountryFromDomain(institutionId)
    || process.env.PROVISIONING_DEFAULT_COUNTRY || 'ES';

  const pairing = await createProvisioningPairing({
    institutionId,
    registrationType,
    issuedAt,
    expiresAt,
    providerName: session.institutionName || session.organizationName || domainLabel,
    providerEmail,
    providerCountry: country,
    consumerName: session.institutionName || session.organizationName || domainLabel,
  });

  return {
    ...publicProvisioningPairing(pairing),
    challenge: pairing.challenge,
    status: pairing.status,
  };
}

export async function assertPairingBelongsToSession(pairingId, sessionContext) {
  const pairing = await getProvisioningPairing(pairingId);
  if (!pairing || pairing.institutionId !== sessionContext.institutionId) {
    throw new HttpError(404, 'Provisioning pairing not found', 'PAIRING_NOT_FOUND');
  }
  if (isProvisioningPairingExpired(pairing)) {
    throw new HttpError(410, 'Provisioning pairing has expired', 'PAIRING_EXPIRED');
  }
  return pairing;
}

export function pairingErrorResponse(error) {
  const status = error instanceof HttpError
    ? error.status
    : Number.isInteger(error?.status) ? error.status : 400;
  return NextResponse.json({
    error: error instanceof HttpError ? error.message : 'Provisioning pairing failed',
    code: error.code || 'PROVISIONING_PAIRING_FAILED',
  }, { status });
}
