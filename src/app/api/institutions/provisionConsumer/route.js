import { NextResponse } from 'next/server';
import { requireAuth, HttpError, ForbiddenError } from '@/utils/auth/guards';
import { hasInstitutionRegistrationPrivilege } from '@/utils/auth/roleValidation';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain';
import devLog from '@/utils/dev/logger';
import {
  normalizeHttpsUrl,
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

/**
 * POST /api/institutions/provisionConsumer
 * 
 * Generates a provisioning token for SSO institutional staff to register
 * their institution as CONSUMER-ONLY (no labs published, only reserves).
 * 
 * Unlike provisionToken (for providers), this does NOT require a provider auth endpoint,
 * but it DOES require the institutional blockchain-services public base URL to set the JWT audience.
 */
export async function POST(request) {
  try {
    const session = await requireAuth();

    // Enforce SSO session with institutional roles
    if (!session?.samlAssertion) {
      throw new ForbiddenError('Consumer provisioning token requires SSO session');
    }
    if (!hasInstitutionRegistrationPrivilege(session)) {
      throw new ForbiddenError(
        'Consumer provisioning token requires an institutional administrator entitlement or a faculty, staff, or employee SSO affiliation'
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

    const consumerNameCandidate =
      body.consumerName ||
      session.institutionName ||
      deriveInstitutionLabel(organizationDomain);
    const consumerName = requireString(
      consumerNameCandidate || organizationDomain || session.name,
      'Consumer institution name'
    );
    const responsiblePerson = (session.name || session.displayName || session.email || session.mail || '').trim();

    const { chainId, registryContract } = getProvisioningRegistryConfig();
    const responsibleEmail = (session.email || session.mail || '').trim();
    const claims = {
      marketplaceBaseUrl,
      institutionId: organizationDomain,
      walletAddress,
      canonicalBackendOrigin,
      registrationType: PROVISIONING_REGISTRATION_TYPES.CONSUMER,
      chainId,
      registryContract,
      consumerName,
      responsiblePerson,
      responsibleEmail,
      issuedBy: session.id || session.eduPersonPrincipalName || responsibleEmail,
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
    devLog.error('[API] provisionConsumer: generation failed', sanitizeErrorForLog(error));
    const status = error instanceof HttpError ? error.status : 400;
    return publicErrorResponse({
      status,
      code: error.code || 'CONSUMER_PROVISIONING_TOKEN_FAILED',
      message: error instanceof HttpError
        ? error.message
        : 'The consumer provisioning token could not be generated.',
      error,
      context: 'institution-provision-consumer',
    });
  }
}
