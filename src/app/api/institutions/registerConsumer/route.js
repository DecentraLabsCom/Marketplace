import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';
import {
  extractBearerToken,
  normalizeHttpsUrl,
  requireString,
  verifyProvisioningToken,
} from '@/utils/auth/provisioningToken';
import {
  PROVISIONING_REGISTRATION_TYPES,
  getProvisioningRegistryConfig,
  recoverProvisioningWalletAddress,
  validateProvisioningClaims,
} from '@/utils/auth/provisioningTypedData';
import {
  ProvisioningReplayError,
  consumeProvisioningJti,
  updateProvisioningAudit,
} from '@/utils/auth/provisioningReplayStore';
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function recordProvisioningResult(jti, result) {
  try {
    await updateProvisioningAudit(jti, result);
  } catch (error) {
    devLog.error('[API] registerConsumer: Failed to update provisioning audit', sanitizeErrorForLog(error));
  }
}

/**
 * Normalize and validate a backend URL (base URL for IB).
 */
function normalizeBackendUrl(backendUrl) {
  if (!backendUrl || typeof backendUrl !== 'string') {
    return null;
  }

  let trimmed = backendUrl.trim();
  if (!trimmed) {
    return null;
  }

  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }

  if (trimmed.endsWith('/auth')) {
    trimmed = trimmed.slice(0, -5);
  }

  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return null;
  }

  if (trimmed.length < 12 || trimmed.length > 255) {
    return null;
  }

  return trimmed;
}

/**
 * POST /api/institutions/registerConsumer
 * 
 * Secure endpoint for blockchain-services to register as CONSUMER-ONLY institution.
 * Only executes grantInstitutionRole (does NOT call addProvider).
 * 
 * Requires provisioning token authentication.
 */
export async function POST(request) {
  try {
    const headersList = await headers();
    const provisioningToken = extractBearerToken(headersList.get('authorization'));
    if (!provisioningToken) {
      devLog.warn('[API] registerConsumer: Missing provisioning token');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { walletSignature } = body;

    const requestOrigin = request?.nextUrl?.origin || new URL(request.url).origin;
    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || requestOrigin,
      'Marketplace base URL'
    );
    let payload;
    try {
      payload = await verifyProvisioningToken(provisioningToken, { issuer: marketplaceBaseUrl });
    } catch (error) {
      devLog.warn('[API] registerConsumer: Invalid provisioning token', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    try {
      payload = validateProvisioningClaims(payload, {
        registrationType: PROVISIONING_REGISTRATION_TYPES.CONSUMER,
        ...getProvisioningRegistryConfig(),
      });
      const recoveredWallet = recoverProvisioningWalletAddress(payload, walletSignature);
      if (recoveredWallet.toLowerCase() !== payload.walletAddress.toLowerCase()) {
        throw new Error('Institutional wallet signature mismatch');
      }
    } catch (error) {
      devLog.warn('[API] registerConsumer: Invalid institutional wallet proof', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Invalid institutional wallet proof' },
        { status: 401 }
      );
    }
    const walletAddress = payload.walletAddress;

    let consumerOrganization;
    let normalizedBackendUrl;
    try {
      consumerOrganization = requireString(payload.institutionId, 'Organization (schacHomeOrganization)');
      normalizedBackendUrl = normalizeBackendUrl(payload.canonicalBackendOrigin);
    } catch (error) {
      return publicErrorResponse({
        status: 400,
        code: 'INVALID_PROVISIONING_TOKEN',
        message: error.message || 'Invalid provisioning token payload',
        error,
        context: 'institution-register-consumer-token',
      });
    }

    // Normalize organization domain to lowercase for consistency
    const normalizedOrganization = marketplaceJwtService.normalizeOrganizationDomain(consumerOrganization.trim());

    const contract = await getContractInstance('diamond', true);

    // Check if organization is already registered to this or another wallet
    try {
      const resolvedWallet = await contract.resolveSchacHomeOrganization(normalizedOrganization);
      
      if (resolvedWallet && resolvedWallet !== ZERO_ADDRESS) {
        if (resolvedWallet.toLowerCase() === walletAddress.toLowerCase()) {
          devLog.log('[API] registerConsumer: Institution already registered', { walletAddress, organization: normalizedOrganization });

          let backendTxHash = null;
          try {
            await consumeProvisioningJti(payload);
          } catch (error) {
            if (error instanceof ProvisioningReplayError) {
              return NextResponse.json(
                { error: 'Provisioning token has already been consumed', code: 'PROVISIONING_TOKEN_CONSUMED' },
                { status: 409 }
              );
            }
            return NextResponse.json(
              { error: 'Provisioning registration is temporarily unavailable', code: 'PROVISIONING_STORE_UNAVAILABLE' },
              { status: 503 }
            );
          }
          if (normalizedBackendUrl) {
            try {
              const existingBackend = normalizeBackendUrl(
                await contract.getSchacHomeOrganizationBackend(normalizedOrganization)
              );
              if (!existingBackend || existingBackend !== normalizedBackendUrl) {
                const writeContract = await getContractInstance('diamond', false);
                const backendTx = await writeContract.adminSetSchacHomeOrganizationBackend(
                  walletAddress,
                  normalizedOrganization,
                  normalizedBackendUrl
                );
                const backendReceipt = await backendTx.wait();
                backendTxHash = backendReceipt?.hash ?? backendTx?.hash;
              }
            } catch (err) {
              devLog.warn('[API] registerConsumer: Backend update failed', err);
            }
          }

          await recordProvisioningResult(payload.jti, {
            status: 'already-registered',
            txHashes: backendTxHash ? [backendTxHash] : [],
          });

          return NextResponse.json(
            {
              success: true,
              alreadyRegistered: true,
              walletAddress,
              organization: normalizedOrganization,
              backendUrl: normalizedBackendUrl || null,
              backendTxHash
            },
            { status: 200 }
          );
        } else {
          devLog.warn('[API] registerConsumer: Organization already registered to different wallet', { 
            organization: normalizedOrganization, 
            existingWallet: resolvedWallet 
          });
          return NextResponse.json(
            { error: 'Organization already registered to a different wallet' },
            { status: 409 }
          );
        }
      }
    } catch (err) {
      // Organization not registered yet, continue
      devLog.log('[API] registerConsumer: Organization not found, proceeding with registration');
    }

    try {
      await consumeProvisioningJti(payload);
    } catch (error) {
      if (error instanceof ProvisioningReplayError) {
        return NextResponse.json(
          { error: 'Provisioning token has already been consumed', code: 'PROVISIONING_TOKEN_CONSUMED' },
          { status: 409 }
        );
      }
      devLog.error('[API] registerConsumer: Provisioning replay store unavailable', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Provisioning registration is temporarily unavailable', code: 'PROVISIONING_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }

    // Execute grantInstitutionRole transaction
    devLog.log('[API] registerConsumer: Granting institution role', { walletAddress, organization: normalizedOrganization });

    const writeContract = await getContractInstance('diamond', false);
    const grantRoleTx = await writeContract.grantInstitutionRole(
      walletAddress,
      normalizedOrganization
    );
    const grantRoleReceipt = await grantRoleTx.wait();
    const grantRoleTxHash = grantRoleReceipt?.hash ?? grantRoleTx?.hash;

    await recordProvisioningResult(payload.jti, {
      status: 'in-progress',
      txHashes: [grantRoleTxHash].filter(Boolean),
    });

    devLog.log('[API] registerConsumer: Institution role granted successfully', grantRoleTxHash);

    let backendTxHash = null;
    if (normalizedBackendUrl) {
      devLog.log('[API] registerConsumer: Updating backend URL', { walletAddress, organization: normalizedOrganization, backendUrl: normalizedBackendUrl });
      const backendTx = await writeContract.adminSetSchacHomeOrganizationBackend(
        walletAddress,
        normalizedOrganization,
        normalizedBackendUrl
      );
      const backendReceipt = await backendTx.wait();
      backendTxHash = backendReceipt?.hash ?? backendTx?.hash;
      await recordProvisioningResult(payload.jti, {
        status: 'in-progress',
        txHashes: [grantRoleTxHash, backendTxHash].filter(Boolean),
      });
    }

    await recordProvisioningResult(payload.jti, {
      status: 'registered',
      txHashes: [grantRoleTxHash, backendTxHash].filter(Boolean),
    });

    return NextResponse.json(
      {
        success: true,
        walletAddress,
        grantRoleTxHash,
        organization: normalizedOrganization,
        backendUrl: normalizedBackendUrl || null,
        backendTxHash
      },
      { status: 201 }
    );

  } catch (error) {
    devLog.error('[API] registerConsumer: Error', sanitizeErrorForLog(error));
    
    // Check for specific contract errors
    if (error.message?.includes('already exists') || error.message?.includes('AccessControlUnauthorizedAccount')) {
      return NextResponse.json(
        { error: 'Consumer registration could not be completed', code: 'CONSUMER_REGISTRATION_CONFLICT' },
        { status: 409 }
      );
    }

    return publicErrorResponse({
      status: 500,
      code: 'CONSUMER_REGISTRATION_FAILED',
      message: 'The consumer institution registration could not be completed.',
      error,
      context: 'institution-register-consumer',
    });
  }
}
