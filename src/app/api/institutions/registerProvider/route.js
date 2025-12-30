import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Validate authURI format (https://, ends with /auth, no trailing slash)
 */
function validateAuthURI(authURI) {
  if (!authURI || typeof authURI !== 'string') {
    return { valid: false, error: 'authURI is required' };
  }

  const trimmed = authURI.trim();
  
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'authURI must start with https://' };
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
 * Validate email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
 * Requires shared API key authentication
 */
export async function POST(request) {
  try {
    const headersList = await headers();
    const apiKey = headersList.get('x-api-key');

    // Validate API key
    const expectedApiKey = process.env.INSTITUTIONAL_SERVICES_API_KEY;
    if (!expectedApiKey) {
      devLog.error('[API] registerProvider: INSTITUTIONAL_SERVICES_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      devLog.warn('[API] registerProvider: Invalid or missing API key');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { name, walletAddress, email, country, authURI, organization } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Provider name is required' },
        { status: 400 }
      );
    }

    if (!validateAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (!country || typeof country !== 'string' || country.trim().length === 0) {
      return NextResponse.json(
        { error: 'Country is required' },
        { status: 400 }
      );
    }

    const authValidation = validateAuthURI(authURI);
    if (!authValidation.valid) {
      return NextResponse.json(
        { error: authValidation.error },
        { status: 400 }
      );
    }

    if (!organization || typeof organization !== 'string' || organization.trim().length === 0) {
      return NextResponse.json(
        { error: 'Organization (schacHomeOrganization) is required' },
        { status: 400 }
      );
    }

    // Check if provider already exists and prepare transaction data
    const contract = await getContractInstance('diamond', true);
    let needsRegistration = true;
    let needsRoleGrant = true;

    // Normalize organization domain to lowercase for consistency
    const normalizedOrganization = marketplaceJwtService.normalizeOrganizationDomain(organization.trim());

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

    if (!needsRegistration && !needsRoleGrant) {
      return NextResponse.json(
        {
          success: true,
          alreadyRegistered: true,
          walletAddress,
          organization: normalizedOrganization
        },
        { status: 200 }
      );
    }

    const writeContract = await getContractInstance('diamond', false);
    const txHashes = [];

    if (needsRegistration) {
      devLog.log('[API] registerProvider: Adding provider', walletAddress);
      const addProviderTx = await writeContract.addProvider(
        name.trim(),
        walletAddress,
        email.trim(),
        country.trim(),
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

    return NextResponse.json(
      {
        success: true,
        walletAddress,
        organization: normalizedOrganization,
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
