import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import devLog from '@/utils/dev/logger';
import { hasAdminRole } from '@/utils/auth/roleValidation';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { getSessionFromCookies } from '@/utils/auth/sessionCookie';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Extract candidate organization domains from SAML user attributes.
 * - Primary: schacHomeOrganization
 * - Secondary: domains inferred from eduPersonScopedAffiliation (after "@")
 * @param {Object} samlUser
 * @returns {string[]} array of domains (raw, not normalized)
 */
function extractCandidateDomains(samlUser) {
  const domains = new Set();

  if (samlUser?.schacHomeOrganization) {
    domains.add(String(samlUser.schacHomeOrganization).trim());
  }

  const scoped = samlUser?.eduPersonScopedAffiliation || samlUser?.scopedRole;
  const scopedArray = Array.isArray(scoped) ? scoped : scoped ? [scoped] : [];

  for (const entry of scopedArray) {
    if (!entry) continue;
    const parts = String(entry).split('@');
    if (parts.length === 2 && parts[1].trim().length > 0) {
      domains.add(parts[1].trim());
    }
  }

  return Array.from(domains);
}

/**
 * Normalize schacHomeOrganization-style domains using the same rules
 * as LibInstitutionalOrg.normalizeOrganization (lowercase + charset).
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
 * POST /api/institutions/invite
 * Generates a signed JWT invitation token for institutional onboarding.
 * Requires SSO session and appropriate institutional role.
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const samlUser = getSessionFromCookies(cookieStore);

    if (!samlUser) {
      return NextResponse.json(
        { error: 'No SSO session found' },
        { status: 401 },
      );
    }

    // Role-based eligibility check (institutional staff, etc.)
    const { role, scopedRole } = samlUser || {};
    if (!hasAdminRole?.(role, scopedRole)) {
      return NextResponse.json(
        {
          error:
            'Your institutional role does not have permission to generate invite tokens',
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const explicitWallet = body?.expectedWallet;

    const candidateDomains = extractCandidateDomains(samlUser);
    if (!candidateDomains.length) {
      return NextResponse.json(
        {
          error:
            'No institutional domains found in your SSO attributes (schacHomeOrganization or eduPersonScopedAffiliation)',
        },
        { status: 400 },
      );
    }

    // Filter out domains that are already registered on-chain
    let availableDomains = [];
    try {
      const contract = await getContractInstance();

      const checks = await Promise.all(
        candidateDomains.map(async (domain) => {
          try {
            const normalized = normalizeOrganizationDomain(domain);
            const wallet =
              await contract.resolveSchacHomeOrganization(normalized);
            const registered =
              wallet && wallet !== ZERO_ADDRESS;
            return { domain, normalized, registered };
          } catch (err) {
            devLog.warn(
              '[API] institutions/invite: Skipping invalid domain candidate',
              domain,
              err?.message || err,
            );
            return null;
          }
        }),
      );

      availableDomains = checks
        .filter((c) => c && !c.registered)
        .map((c) => c.domain);
    } catch (err) {
      devLog.error(
        '[API] institutions/invite: Failed to check domain registrations',
        err,
      );
      return NextResponse.json(
        { error: 'Failed to check institutional domain registration' },
        { status: 500 },
      );
    }

    if (!availableDomains.length) {
      return NextResponse.json(
        {
          error:
            'All institutional domains in your SSO attributes are already registered on-chain',
        },
        { status: 409 },
      );
    }

    const { token, payload } =
      await marketplaceJwtService.generateInstitutionInviteToken({
        samlUser,
        domains: availableDomains,
        expectedWallet: explicitWallet,
      });

    const expiresAt = new Date(payload.exp * 1000).toISOString();

    devLog.log(
      '[API] institutions/invite: token generated for',
      payload.issuerUserId,
      'domains:',
      payload.organizationDomains,
    );

    return NextResponse.json(
      {
        token,
        expiresAt,
        organizationDomains: payload.organizationDomains,
        issuerInstitution: payload.issuerInstitution,
      },
      { status: 200 },
    );
  } catch (error) {
    devLog.error('Error in institutions/invite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
