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
  PROVISIONING_SAGA_STAGES,
  startOrResumeProvisioningSaga,
} from '@/utils/auth/provisioningReplayStore';
import { recordProvisioningResult as persistProvisioningResult } from '@/utils/auth/provisioningSagaBoundary';
import { ProvisioningReconciliationRequiredError } from '@/utils/auth/provisioningSagaBoundary';
import {
  IntentSignerBusyError,
  IntentSignerUnavailableError,
  getServerSignerAddress,
  withIntentSignerLock,
} from '@/utils/intents/intentNonceStore';
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'
import { invalidateInstitutionalBackend } from '@/utils/onboarding/institutionalBackend'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const PROVISIONING_SIGNER_WAIT_MS = Number.parseInt(
  process.env.PROVISIONING_SIGNER_WAIT_MS || '30000',
  10,
);

async function recordProvisioningResult(jti, result) {
  return persistProvisioningResult(jti, result, { operation: 'register-consumer' });
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

    try {
      const saga = await startOrResumeProvisioningSaga(payload);
      if (saga.record?.stage === PROVISIONING_SAGA_STAGES.RECONCILIATION_REQUIRED) {
        return NextResponse.json({
          error: 'Provisioning state requires operational reconciliation before retry',
          code: 'PROVISIONING_RECONCILIATION_REQUIRED',
        }, { status: 503 });
      }
    } catch (error) {
      if (error instanceof ProvisioningReplayError) {
        return NextResponse.json(
          { error: 'Provisioning token conflicts with an existing registration', code: 'PROVISIONING_TOKEN_CONFLICT' },
          { status: 409 }
        );
      }
      devLog.error('[API] registerConsumer: Provisioning saga store unavailable', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Provisioning registration is temporarily unavailable', code: 'PROVISIONING_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }

    try {
      return await withIntentSignerLock(getServerSignerAddress(), async (lease) => {
        await lease.assertActive();
        const contract = await getContractInstance('diamond', true);
        const resolvedWallet = await contract.resolveSchacHomeOrganization(normalizedOrganization);
        if (resolvedWallet && resolvedWallet !== ZERO_ADDRESS && resolvedWallet.toLowerCase() !== walletAddress.toLowerCase()) {
          return NextResponse.json(
            { error: 'Organization already registered to a different wallet' },
            { status: 409 },
          );
        }

        let existingBackendUrl = null;
        if (normalizedBackendUrl) {
          const rawBackend = await contract.getSchacHomeOrganizationBackend(normalizedOrganization);
          existingBackendUrl = normalizeBackendUrl(rawBackend);
        }
        const needsRoleGrant = !resolvedWallet || resolvedWallet === ZERO_ADDRESS;
        const shouldUpdateBackend = Boolean(normalizedBackendUrl) && existingBackendUrl !== normalizedBackendUrl;

        await recordProvisioningResult(payload.jti, {
          stage: PROVISIONING_SAGA_STAGES.WALLET_VERIFIED,
          fencingToken: lease.fencingToken,
        });

        if (!needsRoleGrant && !shouldUpdateBackend) {
          await recordProvisioningResult(payload.jti, {
            stage: PROVISIONING_SAGA_STAGES.ACTIVE,
            txHashes: [],
            fencingToken: lease.fencingToken,
          });
          return NextResponse.json({
            success: true,
            alreadyRegistered: true,
            walletAddress,
            organization: normalizedOrganization,
            backendUrl: existingBackendUrl || normalizedBackendUrl || null,
          });
        }

        const writeContract = await getContractInstance('diamond', false);
        let grantRoleTxHash = null;
        let backendTxHash = null;
        if (needsRoleGrant) {
          await lease.assertActive();
          const transaction = await writeContract.grantInstitutionRole(walletAddress, normalizedOrganization);
          const receipt = await transaction.wait();
          grantRoleTxHash = receipt?.hash ?? transaction?.hash;
          await recordProvisioningResult(payload.jti, {
            stage: PROVISIONING_SAGA_STAGES.INSTITUTION_ROLE_GRANTED,
            txHashes: [grantRoleTxHash].filter(Boolean),
            fencingToken: lease.fencingToken,
          });
        }

        if (shouldUpdateBackend) {
          await lease.assertActive();
          const transaction = await writeContract.adminSetSchacHomeOrganizationBackend(
            walletAddress, normalizedOrganization, normalizedBackendUrl,
          );
          const receipt = await transaction.wait();
          backendTxHash = receipt?.hash ?? transaction?.hash;
          await invalidateInstitutionalBackend(normalizedOrganization);
          await recordProvisioningResult(payload.jti, {
            stage: PROVISIONING_SAGA_STAGES.BACKEND_REGISTERED,
            txHashes: [grantRoleTxHash, backendTxHash].filter(Boolean),
            fencingToken: lease.fencingToken,
          });
        }

        const txHashes = [grantRoleTxHash, backendTxHash].filter(Boolean);
        await recordProvisioningResult(payload.jti, {
          stage: PROVISIONING_SAGA_STAGES.ACTIVE,
          txHashes,
          fencingToken: lease.fencingToken,
        });
        return NextResponse.json({
          success: true,
          walletAddress,
          grantRoleTxHash,
          organization: normalizedOrganization,
          backendUrl: normalizedBackendUrl || null,
          backendTxHash,
          txHashes,
        }, { status: 201 });
      }, {
        waitMs: PROVISIONING_SIGNER_WAIT_MS,
        onError: async (error, lease) => {
          if (
            !(error instanceof IntentSignerUnavailableError)
            && !(error instanceof ProvisioningReconciliationRequiredError)
          ) {
            await recordProvisioningResult(payload.jti, {
              stage: PROVISIONING_SAGA_STAGES.FAILED,
              errorCode: 'PROVISIONING_EXECUTION_FAILED',
              fencingToken: lease.fencingToken,
            });
          }
        },
      });
    } catch (error) {
      if (error instanceof IntentSignerBusyError) {
        return NextResponse.json(
          { error: 'Another institutional registration is being processed', code: 'PROVISIONING_SIGNER_BUSY' },
          { status: 409 },
        );
      }
      if (error instanceof IntentSignerUnavailableError) {
        return NextResponse.json(
          { error: 'Provisioning signer coordination is unavailable', code: 'PROVISIONING_SIGNER_UNAVAILABLE' },
          { status: 503 },
        );
      }
      throw error;
    }

  } catch (error) {
    if (error instanceof ProvisioningReconciliationRequiredError) {
      return NextResponse.json({
        error: 'Provisioning state requires operational reconciliation',
        code: error.code,
      }, { status: error.status });
    }
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
