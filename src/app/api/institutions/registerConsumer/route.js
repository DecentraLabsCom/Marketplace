import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';

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
 * POST /api/institutions/registerConsumer
 * 
 * Secure endpoint for blockchain-services to register as CONSUMER-ONLY institution.
 * Only executes grantInstitutionRole (does NOT call addProvider).
 * 
 * Requires shared API key authentication.
 */
export async function POST(request) {
  try {
    const headersList = await headers();
    const apiKey = headersList.get('x-api-key');

    // Validate API key
    const expectedApiKey = process.env.INSTITUTIONAL_SERVICES_API_KEY;
    if (!expectedApiKey) {
      devLog.error('[API] registerConsumer: INSTITUTIONAL_SERVICES_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      devLog.warn('[API] registerConsumer: Invalid or missing API key');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { walletAddress, organization } = body;

    // Validate required fields
    if (!validateAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
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

    const contract = await getContractInstance('diamond', true);

    // Check if organization is already registered to this or another wallet
    try {
      const resolvedWallet = await contract.resolveSchacHomeOrganization(normalizedOrganization);
      
      if (resolvedWallet && resolvedWallet !== ZERO_ADDRESS) {
        if (resolvedWallet.toLowerCase() === walletAddress.toLowerCase()) {
          devLog.log('[API] registerConsumer: Institution already registered', { walletAddress, organization: normalizedOrganization });
          return NextResponse.json(
            {
              success: true,
              alreadyRegistered: true,
              walletAddress,
              organization: normalizedOrganization
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

    return NextResponse.json(
      {
        success: true,
        walletAddress,
        grantRoleTxHash,
        organization: normalizedOrganization
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
