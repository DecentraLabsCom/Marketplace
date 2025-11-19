import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
import devLog from '@/utils/dev/logger';

/**
 * Normalize schacHomeOrganization-style domains using the same rules
 * as LibInstitutionalOrg.normalizeOrganization (lowercase + charset).
 * This must stay in sync with the Solidity implementation.
 * @param {string} domain
 * @returns {string}
 */
function normalizeOrganizationDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Organization domain is required');
  }

  const input = domain.trim();
  if (input.length < 3 || input.length > 255) {
    throw new Error('Invalid organization domain length');
  }

  let normalized = '';
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);

    // Uppercase A-Z -> lowercase a-z
    if (code >= 0x41 && code <= 0x5a) {
      code += 32;
    }

    const ch = String.fromCharCode(code);

    const isLower = code >= 0x61 && code <= 0x7a;
    const isDigit = code >= 0x30 && code <= 0x39;
    const isDash = ch === '-';
    const isDot = ch === '.';

    if (!isLower && !isDigit && !isDash && !isDot) {
      throw new Error('Invalid character in organization domain');
    }

    normalized += ch;
  }

  return normalized;
}

/**
 * Resolve an institution wallet from schacHomeOrganization-like domain.
 * GET /api/contract/institution/resolve?domain=example.edu
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json(
        { error: 'Missing domain parameter' },
        { status: 400 },
      );
    }

    let normalized;
    try {
      normalized = normalizeOrganizationDomain(domain);
    } catch (err) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 },
      );
    }

    const contract = await getContractInstance();

    // InstitutionalOrgRegistryFacet.resolveSchacHomeOrganization(string)
    const wallet = await contract.resolveSchacHomeOrganization(normalized);

    devLog.log(
      '[API] institution/resolve:',
      domain,
      'normalized:',
      normalized,
      'wallet:',
      wallet,
    );

    if (!wallet || wallet === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json(
        {
          domain: normalized,
          wallet: null,
          registered: false,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        domain: normalized,
        wallet: wallet.toLowerCase(),
        registered: true,
      },
      { status: 200 },
    );
  } catch (error) {
    devLog.error('Error in institution/resolve:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}

