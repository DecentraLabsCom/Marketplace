import { NextResponse } from 'next/server';
import { requireAuth, HttpError, ForbiddenError } from '@/utils/auth/guards';
import { hasInstitutionRegistrationPrivilege } from '@/utils/auth/roleValidation';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import { inferCountryFromDomain } from '@/utils/auth/sso';
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain';
import devLog from '@/utils/dev/logger';
import {
  normalizeHttpsUrl,
  requireEmail,
  requireString,
  signProvisioningToken,
} from '@/utils/auth/provisioningToken';
import {
  PROVISIONING_REGISTRATION_TYPES,
  getProvisioningRegistryConfig,
  normalizeBackendOrigin,
  normalizeWalletAddress,
} from '@/utils/auth/provisioningTypedData';
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'

export const runtime = 'nodejs';

const LOCKED_FIELDS = [
  'institutionId',
  'walletAddress',
  'canonicalBackendOrigin',
  'registrationType',
  'chainId',
  'registryContract',
  'jti',
  'nonce',
  'issuedAt',
  'expiresAt',
  'providerName',
  'providerEmail',
  'providerCountry',
];

function deriveInstitutionLabel(domain) {
  if (!domain || typeof domain !== 'string') {
    return '';
  }
  const trimmed = domain.trim();
  if (!trimmed) {
    return '';
  }
  const firstSegment = trimmed.split('.')[0];
  if (!firstSegment) {
    return '';
  }
  return firstSegment.toUpperCase();
}

export async function POST(request) {
  try {
    const session = await requireAuth();

    // Enforce SSO session with institutional roles
    if (!session?.samlAssertion) {
      throw new ForbiddenError('Provisioning token requires SSO session');
    }
    if (!hasInstitutionRegistrationPrivilege(session)) {
      throw new ForbiddenError(
        'Provisioning token requires an institutional administrator entitlement or a faculty, staff, or employee SSO affiliation'
      );
    }

    const body = await request.json().catch(() => ({}));
    const ttlSeconds = parseInt(process.env.PROVISIONING_TOKEN_TTL_SECONDS || '300', 10);

    const canonicalBackendOrigin = normalizeBackendOrigin(
      body.canonicalBackendOrigin || body.publicBaseUrl,
      'Canonical backend origin'
    );
    const walletAddress = normalizeWalletAddress(body.walletAddress);
    const audience = canonicalBackendOrigin;

    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || request.nextUrl.origin,
      'Marketplace base URL'
    );
    const issuer = marketplaceBaseUrl;
    const organizationCandidate = resolveInstitutionDomainFromSession(session);
    if (!organizationCandidate) {
      throw new ForbiddenError('Cannot derive institution domain from the SSO session');
    }
    const organizationDomain = marketplaceJwtService.normalizeOrganizationDomain(organizationCandidate);

    const providerNameCandidate =
      body.providerName ||
      session.institutionName ||
      deriveInstitutionLabel(organizationDomain);
    const providerName = requireString(
      providerNameCandidate || organizationDomain || session.name,
      'Provider name'
    );
    const providerEmail = requireEmail(session.email || session.mail || body.providerEmail, 'Provider email');
    const responsiblePerson = (session.name || session.displayName || providerEmail || '').trim();
    const providerCountry = requireString(
      body.providerCountry ||
        session.country ||
        session.countryCode ||
        session.organizationCountry ||
        session.organizationCountryCode ||
        inferCountryFromDomain(organizationDomain) ||
        process.env.PROVISIONING_DEFAULT_COUNTRY ||
        'ES',
      'Provider country'
    );
    const { chainId, registryContract } = getProvisioningRegistryConfig();
    const claims = {
      marketplaceBaseUrl,
      institutionId: organizationDomain,
      walletAddress,
      canonicalBackendOrigin,
      registrationType: PROVISIONING_REGISTRATION_TYPES.PROVIDER,
      chainId,
      registryContract,
      providerName,
      providerEmail,
      responsiblePerson,
      responsibleEmail: providerEmail,
      issuedBy: session.id || session.eduPersonPrincipalName || providerEmail,
      providerCountry,
    };

    const { token, expiresAt, payload } = await signProvisioningToken(claims, {
      issuer,
      audience,
      ttlSeconds,
    });

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      lockedFields: LOCKED_FIELDS,
      payload,
    });
  } catch (error) {
    devLog.error('[API] provisionToken: generation failed', sanitizeErrorForLog(error));
    const status = error instanceof HttpError ? error.status : 400;
    return publicErrorResponse({
      status,
      code: error.code || 'PROVISIONING_TOKEN_FAILED',
      message: error instanceof HttpError
        ? error.message
        : 'The provisioning token could not be generated.',
      error,
      context: 'institution-provision-token',
    });
  }
}
