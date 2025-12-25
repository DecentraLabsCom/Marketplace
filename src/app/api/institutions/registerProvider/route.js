import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { getServerWallet } from '@/app/api/contract/utils/serverWallet';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Validate authURI format (https://, no trailing slash)
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

    // Normalize organization domain to lowercase for consistency
    const normalizedOrganization = marketplaceJwtService.normalizeOrganizationDomain(organization.trim());

    const contract = await getContractInstance();
    const wallet = getServerWallet();

    // Check if provider already exists
    try {
      const existingProvider = await contract.getProvider(walletAddress);
      if (existingProvider && existingProvider.name && existingProvider.name.length > 0) {
        devLog.log('[API] registerProvider: Provider already registered', walletAddress);
        
        // Check if organization needs to be granted
        const resolvedWallet = await contract.resolveSchacHomeOrganization(normalizedOrganization);
        const needsOrgGrant = !resolvedWallet || resolvedWallet === ZERO_ADDRESS || resolvedWallet.toLowerCase() !== walletAddress.toLowerCase();
        
        if (needsOrgGrant) {
          devLog.log('[API] registerProvider: Granting institution role for existing provider');
          const grantTx = await contract.connect(wallet).grantInstitutionRole(
            walletAddress,
            normalizedOrganization
          );
          await grantTx.wait();
        }

        return NextResponse.json(
          {
            success: true,
            alreadyRegistered: true,
            walletAddress,
            organizationGranted: needsOrgGrant,
            organization: normalizedOrganization
          },
          { status: 200 }
        );
      }
    } catch (err) {
      // Provider doesn't exist, continue with registration
      devLog.log('[API] registerProvider: Provider not found, proceeding with registration');
    }

    // Execute addProvider transaction
    devLog.log('[API] registerProvider: Adding provider', { name, walletAddress, email, country, authURI: authValidation.normalized });
    const addProviderTx = await contract.connect(wallet).addProvider(
      name.trim(),
      walletAddress,
      email.trim(),
      country.trim(),
      authValidation.normalized
    );
    const addProviderReceipt = await addProviderTx.wait();

    devLog.log('[API] registerProvider: Provider added successfully', addProviderReceipt.hash);

    // Execute grantInstitutionRole transaction
    devLog.log('[API] registerProvider: Granting institution role', { walletAddress, organization: normalizedOrganization });
    const grantRoleTx = await contract.connect(wallet).grantInstitutionRole(
      walletAddress,
      normalizedOrganization
    );
    const grantRoleReceipt = await grantRoleTx.wait();

    devLog.log('[API] registerProvider: Institution role granted successfully', grantRoleReceipt.hash);

    return NextResponse.json(
      {
        success: true,
        walletAddress,
        addProviderTxHash: addProviderReceipt.hash,
        grantRoleTxHash: grantRoleReceipt.hash,
        organization: normalizedOrganization
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
