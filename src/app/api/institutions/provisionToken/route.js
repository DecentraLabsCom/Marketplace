import { NextResponse } from 'next/server';
import { requireAuth, HttpError, ForbiddenError } from '@/utils/auth/guards';
import { hasAdminRole } from '@/utils/auth/roleValidation';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';
import {
  normalizeHttpsUrl,
  requireEmail,
  requireString,
  signProvisioningToken,
} from '@/utils/auth/provisioningToken';

export const runtime = 'nodejs';

const LOCKED_FIELDS = ['providerName', 'providerEmail', 'providerCountry', 'providerOrganization'];

export async function POST(request) {
  try {
    const session = await requireAuth();

    // Enforce SSO session with institutional roles
    if (!session?.samlAssertion) {
      throw new ForbiddenError('Provisioning token requires SSO session');
    }
    if (!hasAdminRole(session.role, session.scopedRole)) {
      throw new ForbiddenError('Provisioning token allowed only for institutional staff');
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
      body.providerOrganization || session.affiliation || session.schacHomeOrganization || ''
    );

    const providerName = requireString(
      body.providerName || session.organizationName || session.name || organizationDomain,
      'Provider name'
    );
    const providerEmail = requireEmail(session.email || session.mail || body.providerEmail, 'Provider email');
    const providerCountry = requireString(
      body.providerCountry || process.env.PROVISIONING_DEFAULT_COUNTRY || 'ES',
      'Provider country'
    );
    const payload = {
      marketplaceBaseUrl,
      providerName,
      providerEmail,
      providerCountry,
      providerOrganization: organizationDomain,
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
    devLog.error('[API] provisionToken: generation failed', error);
    const status = error instanceof HttpError ? error.status : 400;
    const message = error.message || 'Failed to generate provisioning token';
    return NextResponse.json({ error: message }, { status });
  }
}
