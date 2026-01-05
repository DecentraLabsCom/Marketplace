import { NextResponse } from 'next/server';
import { requireAuth, HttpError, ForbiddenError } from '@/utils/auth/guards';
import { hasAdminRole } from '@/utils/auth/roleValidation';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';
import {
  normalizeHttpsUrl,
  requireString,
  signProvisioningToken,
} from '@/utils/auth/provisioningToken';

export const runtime = 'nodejs';

const LOCKED_FIELDS = ['consumerOrganization'];

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
    if (!hasAdminRole(session.role, session.scopedRole)) {
      throw new ForbiddenError('Consumer provisioning token allowed only for institutional staff');
    }

    const body = await request.json().catch(() => ({}));
    const ttlSeconds = parseInt(process.env.PROVISIONING_TOKEN_TTL_SECONDS || '300', 10);
    const publicBaseUrl = normalizeHttpsUrl(body.publicBaseUrl, 'Public base URL');
    const audience = publicBaseUrl;

    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || request.nextUrl.origin,
      'Marketplace base URL'
    );
    const issuer = marketplaceBaseUrl;
    const organizationDomain = marketplaceJwtService.normalizeOrganizationDomain(
      body.consumerOrganization || session.affiliation || session.schacHomeOrganization || ''
    );

    const consumerNameCandidate =
      body.consumerName ||
      session.organizationName ||
      session.institutionName ||
      deriveInstitutionLabel(organizationDomain);
    const consumerName = requireString(
      consumerNameCandidate || organizationDomain || session.name,
      'Consumer institution name'
    );
    const responsiblePerson = (session.name || session.displayName || session.email || session.mail || '').trim();

    const payload = {
      type: 'consumer', // Discriminator: consumer vs provider
      marketplaceBaseUrl,
      consumerName,
      responsiblePerson,
      consumerOrganization: organizationDomain,
      publicBaseUrl,
    };

    const { token, expiresAt } = await signProvisioningToken(payload, { issuer, audience, ttlSeconds });

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      lockedFields: LOCKED_FIELDS,
      payload,
    });
  } catch (error) {
    devLog.error('[API] provisionConsumer: generation failed', error);
    const status = error instanceof HttpError ? error.status : 400;
    const message = error.message || 'Failed to generate consumer provisioning token';
    return NextResponse.json({ error: message }, { status });
  }
}
