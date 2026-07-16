import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';
import {
  extractBearerToken,
  normalizeHttpsUrl,
  requireEmail,
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
  advanceProvisioningSaga,
  startOrResumeProvisioningSaga,
} from '@/utils/auth/provisioningReplayStore';
import {
  IntentSignerBusyError,
  IntentSignerUnavailableError,
  getServerSignerAddress,
  withIntentSignerLock,
} from '@/utils/intents/intentNonceStore';
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const PROVISIONING_SIGNER_WAIT_MS = Number.parseInt(
  process.env.PROVISIONING_SIGNER_WAIT_MS || '30000',
  10,
);

async function recordProvisioningResult(jti, result) {
  try {
    await advanceProvisioningSaga(jti, result);
  } catch (error) {
    devLog.error('[API] registerProvider: Failed to update provisioning audit', sanitizeErrorForLog(error));
  }
}

/**
 * Validate authURI format (https://, ends with /auth, no trailing slash)
 */
function validateAuthURI(authURI) {
  if (!authURI || typeof authURI !== 'string') {
    return { valid: false, error: 'authURI is required' };
  }

  const trimmed = authURI.trim();
  
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return { valid: false, error: 'authURI must start with http:// or https://' };
  }

  if (trimmed.endsWith('/')) {
    return { valid: false, error: 'authURI must not end with a trailing slash' };
  }

  if (!trimmed.endsWith('/auth')) {
    return { valid: false, error: 'authURI must end with /auth' };
  }

  if (trimmed.length < 12 || trimmed.length > 255) {
    return { valid: false, error: 'authURI length must be between 12 and 255 characters' };
  }

  return { valid: true, normalized: trimmed };
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

function deriveBackendUrlFromAuthURI(authURI) {
  if (!authURI || typeof authURI !== 'string') {
    return null;
  }
  const trimmed = authURI.trim();
  if (!trimmed.endsWith('/auth')) {
    return null;
  }
  return trimmed.slice(0, -5);
}

/**
 * POST /api/institutions/registerProvider
 * Secure endpoint for blockchain-services to register as provider
 * Executes on-chain registration using server signer
 * Requires provisioning token authentication
 */
export async function POST(request) {
  try {
    const headersList = await headers();
    const provisioningToken = extractBearerToken(headersList.get('authorization'));
    if (!provisioningToken) {
      devLog.warn('[API] registerProvider: Missing provisioning token');
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
      devLog.warn('[API] registerProvider: Invalid provisioning token', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    try {
      payload = validateProvisioningClaims(payload, {
        registrationType: PROVISIONING_REGISTRATION_TYPES.PROVIDER,
        ...getProvisioningRegistryConfig(),
      });
      const recoveredWallet = recoverProvisioningWalletAddress(payload, walletSignature);
      if (recoveredWallet.toLowerCase() !== payload.walletAddress.toLowerCase()) {
        throw new Error('Institutional wallet signature mismatch');
      }
    } catch (error) {
      devLog.warn('[API] registerProvider: Invalid institutional wallet proof', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Invalid institutional wallet proof' },
        { status: 401 }
      );
    }
    const walletAddress = payload.walletAddress;

    let providerName;
    let providerEmail;
    let providerCountry;
    let providerOrganization;
    let authValidation;
    let normalizedBackendUrl;

    try {
      providerName = requireString(payload.providerName, 'Provider name');
      providerEmail = requireEmail(payload.providerEmail, 'Provider email');
      providerCountry = requireString(payload.providerCountry, 'Provider country');
      providerOrganization = requireString(payload.institutionId, 'Provider organization');
      const publicBaseUrl = payload.canonicalBackendOrigin;

      let authURI = publicBaseUrl;
      if (!authURI.endsWith('/auth')) {
        authURI = `${authURI}/auth`;
      }
      authValidation = validateAuthURI(authURI);
      if (!authValidation.valid) {
        return NextResponse.json(
          { error: authValidation.error },
          { status: 400 }
        );
      }

      normalizedBackendUrl = deriveBackendUrlFromAuthURI(authValidation.normalized);
    } catch (error) {
      return publicErrorResponse({
        status: 400,
        code: 'INVALID_PROVISIONING_TOKEN',
        message: error.message || 'Invalid provisioning token payload',
        error,
        context: 'institution-register-provider-token',
      });
    }

    // Normalize organization domain to lowercase for consistency
    const normalizedOrganization = marketplaceJwtService.normalizeOrganizationDomain(providerOrganization.trim());
    try {
      await startOrResumeProvisioningSaga(payload);
    } catch (error) {
      if (error instanceof ProvisioningReplayError) {
        return NextResponse.json(
          { error: 'Provisioning token conflicts with an existing registration', code: 'PROVISIONING_TOKEN_CONFLICT' },
          { status: 409 }
        );
      }
      devLog.error('[API] registerProvider: Provisioning saga store unavailable', sanitizeErrorForLog(error));
      return NextResponse.json(
        { error: 'Provisioning registration is temporarily unavailable', code: 'PROVISIONING_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }

    try {
      return await withIntentSignerLock(getServerSignerAddress(), async (lease) => {
        await lease.assertActive();
        const contract = await getContractInstance('diamond', true);
        let needsRegistration = true;
        let needsRoleGrant = true;
        let existingBackendUrl = null;
        let shouldUpdateBackend = Boolean(normalizedBackendUrl);

        const isProvider = await contract.isLabProvider(walletAddress);
        if (isProvider) needsRegistration = false;

        const resolvedWallet = await contract.resolveSchacHomeOrganization(normalizedOrganization);
        if (resolvedWallet && resolvedWallet !== ZERO_ADDRESS) {
          if (resolvedWallet.toLowerCase() !== walletAddress.toLowerCase()) {
            return NextResponse.json(
              { error: 'Organization already registered to a different wallet' },
              { status: 409 },
            );
          }
          needsRoleGrant = false;
        }

        if (normalizedBackendUrl) {
          const rawBackend = await contract.getSchacHomeOrganizationBackend(normalizedOrganization);
          existingBackendUrl = normalizeBackendUrl(rawBackend);
          shouldUpdateBackend = existingBackendUrl !== normalizedBackendUrl;
        }

        await recordProvisioningResult(payload.jti, {
          stage: PROVISIONING_SAGA_STAGES.WALLET_VERIFIED,
          fencingToken: lease.fencingToken,
        });

        if (!needsRegistration && !needsRoleGrant && !shouldUpdateBackend) {
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
        const txHashes = [];

        if (needsRegistration) {
          await lease.assertActive();
          const transaction = await writeContract.addProvider(
            providerName.trim(), walletAddress, providerEmail.trim(), providerCountry.trim(), authValidation.normalized,
          );
          const receipt = await transaction.wait();
          txHashes.push(receipt?.hash ?? transaction?.hash);
          await recordProvisioningResult(payload.jti, {
            stage: PROVISIONING_SAGA_STAGES.PROVIDER_ADDED,
            txHashes: [...txHashes],
            fencingToken: lease.fencingToken,
          });
        }

        if (needsRoleGrant) {
          await lease.assertActive();
          const transaction = await writeContract.grantInstitutionRole(walletAddress, normalizedOrganization);
          const receipt = await transaction.wait();
          txHashes.push(receipt?.hash ?? transaction?.hash);
          await recordProvisioningResult(payload.jti, {
            stage: PROVISIONING_SAGA_STAGES.INSTITUTION_ROLE_GRANTED,
            txHashes: [...txHashes],
            fencingToken: lease.fencingToken,
          });
        }

        if (shouldUpdateBackend) {
          await lease.assertActive();
          const transaction = await writeContract.adminSetSchacHomeOrganizationBackend(
            walletAddress, normalizedOrganization, normalizedBackendUrl,
          );
          const receipt = await transaction.wait();
          txHashes.push(receipt?.hash ?? transaction?.hash);
          await recordProvisioningResult(payload.jti, {
            stage: PROVISIONING_SAGA_STAGES.BACKEND_REGISTERED,
            txHashes: [...txHashes],
            fencingToken: lease.fencingToken,
          });
        }

        await recordProvisioningResult(payload.jti, {
          stage: PROVISIONING_SAGA_STAGES.ACTIVE,
          txHashes,
          fencingToken: lease.fencingToken,
        });
        return NextResponse.json({
          success: true,
          walletAddress,
          organization: normalizedOrganization,
          backendUrl: normalizedBackendUrl || null,
          txHashes,
        }, { status: 201 });
      }, {
        waitMs: PROVISIONING_SIGNER_WAIT_MS,
        onError: async (error, lease) => {
          if (!(error instanceof IntentSignerUnavailableError)) {
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
    devLog.error('[API] registerProvider: Error', sanitizeErrorForLog(error));
    
    // Check for specific contract errors
    if (error.message?.includes('already exists') || error.message?.includes('AccessControlUnauthorizedAccount')) {
      return NextResponse.json(
        { error: 'Provider registration could not be completed', code: 'PROVIDER_REGISTRATION_CONFLICT' },
        { status: 409 }
      );
    }

    return publicErrorResponse({
      status: 500,
      code: 'PROVIDER_REGISTRATION_FAILED',
      message: 'The provider registration could not be completed.',
      error,
      context: 'institution-register-provider',
    });
  }
}
