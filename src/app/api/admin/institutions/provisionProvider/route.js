import { NextResponse } from 'next/server';
import { requireAuth, HttpError } from '@/utils/auth/guards';
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';
import {
  normalizeHttpsUrl,
  requireEmail,
  requireString,
  signProvisioningToken,
} from '@/utils/auth/provisioningToken';
import {
  getProvisioningRegistryConfig,
  normalizeBackendOrigin,
  normalizeWalletAddress,
  PROVISIONING_REGISTRATION_TYPES,
} from '@/utils/auth/provisioningTypedData'
import { recordProvisioningTokenIssued } from '@/utils/auth/provisioningReplayStore'
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

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function POST(request) {
  try {
    const session = await requireAuth();
    const issuedBy = requirePlatformAdminSession(session);
    const body = await request.json().catch(() => ({}));
    const ttlSeconds = parseInt(process.env.PROVISIONING_TOKEN_TTL_SECONDS || '300', 10);

    const canonicalBackendOrigin = normalizeBackendOrigin(
      body.publicBaseUrl,
      'Institutional backend origin'
    )
    const walletAddress = normalizeWalletAddress(body.walletAddress)
    const requestOrigin = request?.nextUrl?.origin || new URL(request.url).origin;
    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || requestOrigin,
      'Marketplace base URL'
    );

    const providerOrganization = marketplaceJwtService.normalizeOrganizationDomain(
      requireString(body.providerOrganization, 'Provider organization')
    );

    const providerEmail = requireEmail(body.providerEmail, 'Provider email');
    const { chainId, registryContract } = getProvisioningRegistryConfig()
    const payload = {
      marketplaceBaseUrl,
      institutionId: providerOrganization,
      walletAddress,
      canonicalBackendOrigin,
      registrationType: PROVISIONING_REGISTRATION_TYPES.PROVIDER,
      chainId,
      registryContract,
      providerName: requireString(body.providerName, 'Provider name'),
      providerEmail,
      responsiblePerson: optionalString(body.responsiblePerson) || providerEmail,
      providerCountry: requireString(body.providerCountry, 'Provider country'),
      providerOrganization,
      verificationMethod: 'manual_review',
      assuranceLevel: 'partner_verified',
      issuedReason: 'approved_partner_provider',
      issuedBy,
    };

    const agreementId = optionalString(body.agreementId);
    if (agreementId) {
      payload.agreementId = agreementId;
    }

    const { token, expiresAt, payload: signedPayload } = await signProvisioningToken(payload, {
      issuer: marketplaceBaseUrl,
      audience: canonicalBackendOrigin,
      ttlSeconds,
    });
    if (!signedPayload?.jti) {
      throw new Error('Signed provisioning token did not include an audit identifier')
    }
    await recordProvisioningTokenIssued(signedPayload)

    devLog.log('[API] admin/provisionProvider: token issued', {
      issuedBy,
      providerOrganization,
      providerEmail: payload.providerEmail,
      canonicalBackendOrigin,
      agreementId: agreementId || null,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      lockedFields: LOCKED_FIELDS,
      payload: signedPayload,
    });
  } catch (error) {
    devLog.error('[API] admin/provisionProvider: generation failed', sanitizeErrorForLog(error));
    const status = error instanceof HttpError ? error.status : 400;
    return publicErrorResponse({
      status,
      code: error.code || 'PROVISIONING_TOKEN_FAILED',
      message: error instanceof HttpError
        ? error.message
        : 'The provisioning token could not be generated.',
      error,
      context: 'admin-provision-provider',
    });
  }
}
