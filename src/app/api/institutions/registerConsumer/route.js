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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Validate Ethereum address
 */
function validateAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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
    const { walletAddress, backendUrl } = body;

    const requestOrigin = request?.nextUrl?.origin || new URL(request.url).origin;
    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || requestOrigin,
      'Marketplace base URL'
    );
    let payload;
    try {
      payload = await verifyProvisioningToken(provisioningToken, { issuer: marketplaceBaseUrl });
    } catch (error) {
      devLog.warn('[API] registerConsumer: Invalid provisioning token', error);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (payload.type !== 'consumer') {
      return NextResponse.json(
        { error: 'Provider provisioning token is not valid for consumer registration' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!validateAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    let consumerOrganization;
    let normalizedBackendUrl;
    try {
      consumerOrganization = requireString(payload.consumerOrganization, 'Organization (schacHomeOrganization)');
      const tokenAudience = Array.isArray(payload.aud)
        ? payload.aud.find((value) => typeof value === 'string' && value.trim())
        : payload.aud;
      const normalizedTokenAudience = tokenAudience
        ? normalizeHttpsUrl(tokenAudience, 'Public base URL')
        : null;
      normalizedBackendUrl = normalizeBackendUrl(backendUrl)
        || (normalizedTokenAudience ? normalizeBackendUrl(normalizedTokenAudience) : null);
      if (backendUrl && !normalizedBackendUrl) {
        return NextResponse.json(
          { error: 'Invalid backendUrl format (must be http:// or https:// and a base URL)' },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: error.message || 'Invalid provisioning token payload' },
        { status: 400 }
      );
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

    // Execute grantInstitutionRole transaction
    devLog.log('[API] registerConsumer: Granting institution role', { walletAddress, organization: normalizedOrganization });

    const writeContract = await getContractInstance('diamond', false);
    const grantRoleTx = await writeContract.grantInstitutionRole(
      walletAddress,
      normalizedOrganization
    );
    const grantRoleReceipt = await grantRoleTx.wait();
    const grantRoleTxHash = grantRoleReceipt?.hash ?? grantRoleTx?.hash;

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
    }

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
    devLog.error('[API] registerConsumer: Error', error);
    
    // Check for specific contract errors
    if (error.message?.includes('already exists') || error.message?.includes('AccessControlUnauthorizedAccount')) {
      return NextResponse.json(
        { error: 'Consumer registration failed: ' + error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to register consumer institution' },
      { status: 500 }
    );
  }
}
