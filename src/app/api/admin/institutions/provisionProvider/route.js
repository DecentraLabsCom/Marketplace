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
import { ethers } from 'ethers';
import { randomUUID } from 'node:crypto';
import { defaultChain } from '@/utils/blockchain/networkConfig';
import { getDiamondAddress } from '@/utils/intents/intentDomain';

export const runtime = 'nodejs';

const LOCKED_FIELDS = [
  'providerName',
  'providerEmail',
  'providerCountry',
  'providerOrganization',
  'walletAddress',
  'chainId',
  'verifyingContract',
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

    const publicBaseUrl = normalizeHttpsUrl(body.publicBaseUrl, 'Public base URL');
    const requestOrigin = request?.nextUrl?.origin || new URL(request.url).origin;
    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || requestOrigin,
      'Marketplace base URL'
    );

    const providerOrganization = marketplaceJwtService.normalizeOrganizationDomain(
      requireString(body.providerOrganization, 'Provider organization')
    );

    const providerEmail = requireEmail(body.providerEmail, 'Provider email');
    let walletAddress;
    try {
      walletAddress = ethers.getAddress(requireString(body.walletAddress, 'Institutional wallet address'));
    } catch (error) {
      throw new Error('Institutional wallet address must be a valid EVM address', { cause: error });
    }
    const payload = {
      marketplaceBaseUrl,
      providerName: requireString(body.providerName, 'Provider name'),
      providerEmail,
      responsiblePerson: optionalString(body.responsiblePerson) || providerEmail,
      providerCountry: requireString(body.providerCountry, 'Provider country'),
      providerOrganization,
      publicBaseUrl,
      walletAddress,
      chainId: defaultChain.id,
      verifyingContract: ethers.getAddress(getDiamondAddress()),
      registrationNonce: randomUUID(),
      verificationMethod: 'manual_review',
      assuranceLevel: 'partner_verified',
      issuedReason: 'approved_partner_provider',
      issuedBy,
    };

    const agreementId = optionalString(body.agreementId);
    if (agreementId) {
      payload.agreementId = agreementId;
    }

    const { token, expiresAt } = await signProvisioningToken(payload, {
      issuer: marketplaceBaseUrl,
      audience: publicBaseUrl,
      ttlSeconds,
    });

    devLog.log('[API] admin/provisionProvider: token issued', {
      issuedBy,
      providerOrganization,
      providerEmail: payload.providerEmail,
      publicBaseUrl,
      agreementId: agreementId || null,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      token,
      expiresAt,
      lockedFields: LOCKED_FIELDS,
      payload,
    });
  } catch (error) {
    devLog.error('[API] admin/provisionProvider: generation failed', error);
    const status = error instanceof HttpError ? error.status : 400;
    const message = error.message || 'Failed to generate provider provisioning token';
    return NextResponse.json({ error: message }, { status });
  }
}
