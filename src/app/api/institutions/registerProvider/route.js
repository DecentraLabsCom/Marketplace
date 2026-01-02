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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
 * Validate Ethereum address
 */
function validateAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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
    const { walletAddress } = body;

    const requestOrigin = request?.nextUrl?.origin || new URL(request.url).origin;
    const marketplaceBaseUrl = normalizeHttpsUrl(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || requestOrigin,
      'Marketplace base URL'
    );
    let payload;
    try {
      payload = await verifyProvisioningToken(provisioningToken, { issuer: marketplaceBaseUrl });
    } catch (error) {
      devLog.warn('[API] registerProvider: Invalid provisioning token', error);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (payload.type === 'consumer') {
      return NextResponse.json(
        { error: 'Consumer provisioning token is not valid for provider registration' },
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
      providerOrganization = requireString(payload.providerOrganization, 'Provider organization');
      const publicBaseUrl = normalizeHttpsUrl(payload.publicBaseUrl, 'Public base URL');

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
      return NextResponse.json(
        { error: error.message || 'Invalid provisioning token payload' },
        { status: 400 }
      );
    }

    // Check if provider already exists and prepare transaction data
    const contract = await getContractInstance('diamond', true);
    let needsRegistration = true;
    let needsRoleGrant = true;

    // Normalize organization domain to lowercase for consistency
    const normalizedOrganization = marketplaceJwtService.normalizeOrganizationDomain(providerOrganization.trim());

    // Check if provider already exists
    try {
      const isProvider = await contract.isLabProvider(walletAddress);
      if (isProvider) {
        devLog.log('[API] registerProvider: Provider already registered', walletAddress);
        needsRegistration = false;
      }
    } catch (err) {
      // Provider doesn't exist or contract call failed, needs registration
      devLog.log('[API] registerProvider: Provider not found, needs registration');
    }

    // Check if organization role needs to be granted (and ensure no conflicts)
    try {
      const resolvedWallet = await contract.resolveSchacHomeOrganization(normalizedOrganization);
      if (resolvedWallet && resolvedWallet !== ZERO_ADDRESS) {
        if (resolvedWallet.toLowerCase() === walletAddress.toLowerCase()) {
          devLog.log('[API] registerProvider: Organization role already granted', { walletAddress, organization: normalizedOrganization });
          needsRoleGrant = false;
        } else {
          devLog.warn('[API] registerProvider: Organization already registered to different wallet', {
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
      // Organization not registered yet
      devLog.log('[API] registerProvider: Organization not found, needs role grant');
    }

    let shouldUpdateBackend = Boolean(normalizedBackendUrl);
    let existingBackendUrl = null;
    if (normalizedBackendUrl) {
      try {
        const rawBackend = await contract.getSchacHomeOrganizationBackend(normalizedOrganization);
        existingBackendUrl = normalizeBackendUrl(rawBackend);
        if (existingBackendUrl && existingBackendUrl === normalizedBackendUrl) {
          shouldUpdateBackend = false;
        }
      } catch (err) {
        devLog.warn('[API] registerProvider: Backend lookup failed', err);
      }
    }

    if (!needsRegistration && !needsRoleGrant && !shouldUpdateBackend) {
      return NextResponse.json(
        {
          success: true,
          alreadyRegistered: true,
          walletAddress,
          organization: normalizedOrganization,
          backendUrl: existingBackendUrl || normalizedBackendUrl || null,
        },
        { status: 200 }
      );
    }

    const writeContract = await getContractInstance('diamond', false);
    const txHashes = [];

    if (needsRegistration) {
      devLog.log('[API] registerProvider: Adding provider', walletAddress);
      const addProviderTx = await writeContract.addProvider(
        providerName.trim(),
        walletAddress,
        providerEmail.trim(),
        providerCountry.trim(),
        authValidation.normalized
      );
      const addProviderReceipt = await addProviderTx.wait();
      txHashes.push(addProviderReceipt?.hash ?? addProviderTx?.hash);
    }

    if (needsRoleGrant) {
      devLog.log('[API] registerProvider: Granting institution role', { walletAddress, organization: normalizedOrganization });
      const grantRoleTx = await writeContract.grantInstitutionRole(walletAddress, normalizedOrganization);
      const grantRoleReceipt = await grantRoleTx.wait();
      txHashes.push(grantRoleReceipt?.hash ?? grantRoleTx?.hash);
    }

    if (shouldUpdateBackend) {
      devLog.log('[API] registerProvider: Updating backend URL', { walletAddress, organization: normalizedOrganization, backendUrl: normalizedBackendUrl });
      const backendTx = await writeContract.adminSetSchacHomeOrganizationBackend(
        walletAddress,
        normalizedOrganization,
        normalizedBackendUrl
      );
      const backendReceipt = await backendTx.wait();
      txHashes.push(backendReceipt?.hash ?? backendTx?.hash);
    }

    return NextResponse.json(
      {
        success: true,
        walletAddress,
        organization: normalizedOrganization,
        backendUrl: normalizedBackendUrl || null,
        txHashes
      },
      { status: 201 }
    );

  } catch (error) {
    devLog.error('[API] registerProvider: Error', error);
    
    // Check for specific contract errors
    if (error.message?.includes('already exists') || error.message?.includes('AccessControlUnauthorizedAccount')) {
      return NextResponse.json(
        { error: 'Provider registration failed: ' + error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to register provider' },
      { status: 500 }
    );
  }
}
