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

const COMMON_LOCKED_FIELDS = [
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

    const registrationType = body.registrationType || PROVISIONING_REGISTRATION_TYPES.PROVIDER;
    if (!Object.values(PROVISIONING_REGISTRATION_TYPES).includes(registrationType)) {
      throw new Error('registrationType must be provider or consumer');
    }
    const isConsumer = registrationType === PROVISIONING_REGISTRATION_TYPES.CONSUMER;
    const institutionOrganization = marketplaceJwtService.normalizeOrganizationDomain(
      requireString(body.providerOrganization, isConsumer ? 'Consumer organization' : 'Provider organization')
    );

    const { chainId, registryContract } = getProvisioningRegistryConfig()
    const payload = {
      marketplaceBaseUrl,
      institutionId: institutionOrganization,
      walletAddress,
      canonicalBackendOrigin,
      registrationType,
      chainId,
      registryContract,
      verificationMethod: 'manual_review',
      assuranceLevel: 'partner_verified',
      issuedReason: isConsumer ? 'approved_partner_consumer' : 'approved_partner_provider',
      issuedBy,
    };

    if (isConsumer) {
      payload.consumerName = requireString(body.consumerName, 'Consumer name');
    } else {
      const providerEmail = requireEmail(body.providerEmail, 'Provider email');
      payload.providerName = requireString(body.providerName, 'Provider name');
      payload.providerEmail = providerEmail;
      payload.responsiblePerson = optionalString(body.responsiblePerson) || providerEmail;
      payload.providerCountry = requireString(body.providerCountry, 'Provider country');
      payload.providerOrganization = institutionOrganization;
    }

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
      registrationType,
      institutionOrganization,
      providerEmail: payload.providerEmail || null,
      canonicalBackendOrigin,
      agreementId: agreementId || null,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      lockedFields: [
        ...COMMON_LOCKED_FIELDS,
        ...(isConsumer ? ['consumerName'] : ['providerName', 'providerEmail', 'providerCountry']),
      ],
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
