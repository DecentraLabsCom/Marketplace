import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const CHALLENGE_ISSUER = 'marketplace-wallet-session';
const CHALLENGE_AUDIENCE = 'wallet-session';
const CHALLENGE_TYPE = 'wallet-session-challenge';
const DEFAULT_CHALLENGE_TTL_SECONDS = 5 * 60;

const parseBoolean = (value) => String(value || '').toLowerCase() === 'true';

const resolveChallengeTtlSeconds = () => {
  const parsed = Number(process.env.WALLET_SESSION_CHALLENGE_TTL_SECONDS || DEFAULT_CHALLENGE_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CHALLENGE_TTL_SECONDS;
  }
  return Math.floor(parsed);
};

const getWalletSessionSecret = ({ required = false } = {}) => {
  const secret = process.env.WALLET_SESSION_CHALLENGE_SECRET || process.env.SESSION_SECRET || '';
  if (secret && secret.length >= 32) {
    return secret;
  }

  if (required) {
    throw new Error(
      'Wallet session challenge secret is required (set WALLET_SESSION_CHALLENGE_SECRET or SESSION_SECRET with >= 32 chars)'
    );
  }

  return null;
};

export const isWalletSessionSignatureRequired = () =>
  parseBoolean(process.env.WALLET_SESSION_REQUIRE_SIGNATURE);

export const canIssueWalletSessionChallenge = () => Boolean(getWalletSessionSecret({ required: false }));

export function issueWalletSessionChallenge({ walletAddress, origin = null, ttlSeconds } = {}) {
  if (!walletAddress || typeof walletAddress !== 'string') {
    throw new Error('walletAddress is required to issue a wallet session challenge');
  }

  const secret = getWalletSessionSecret({ required: true });
  const lifetimeSeconds = Number.isFinite(ttlSeconds) ? Math.floor(ttlSeconds) : resolveChallengeTtlSeconds();
  const safeTtl = lifetimeSeconds > 0 ? lifetimeSeconds : DEFAULT_CHALLENGE_TTL_SECONDS;

  const payload = {
    typ: CHALLENGE_TYPE,
    wallet: walletAddress.toLowerCase(),
    nonce: randomUUID(),
    ...(origin ? { origin } : {}),
    iat: Math.floor(Date.now() / 1000),
  };

  const challenge = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: CHALLENGE_ISSUER,
    audience: CHALLENGE_AUDIENCE,
    expiresIn: safeTtl,
  });

  const expiresAt = new Date((payload.iat + safeTtl) * 1000).toISOString();

  return {
    challenge,
    expiresAt,
    ttlSeconds: safeTtl,
  };
}

export function verifyWalletSessionChallenge(challenge, expected = {}) {
  if (!challenge || typeof challenge !== 'string') {
    return { ok: false, code: 'MISSING_CHALLENGE' };
  }

  const secret = getWalletSessionSecret({ required: false });
  if (!secret) {
    return { ok: false, code: 'CHALLENGE_UNAVAILABLE' };
  }

  try {
    const payload = jwt.verify(challenge, secret, {
      algorithms: ['HS256'],
      issuer: CHALLENGE_ISSUER,
      audience: CHALLENGE_AUDIENCE,
    });

    if (payload?.typ !== CHALLENGE_TYPE) {
      return { ok: false, code: 'INVALID_CHALLENGE_TYPE' };
    }

    if (expected.walletAddress) {
      const expectedWallet = String(expected.walletAddress).toLowerCase();
      if (payload.wallet !== expectedWallet) {
        return { ok: false, code: 'WALLET_MISMATCH' };
      }
    }

    if (expected.origin && payload.origin && payload.origin !== expected.origin) {
      return { ok: false, code: 'ORIGIN_MISMATCH' };
    }

    return { ok: true, payload };
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return { ok: false, code: 'CHALLENGE_EXPIRED' };
    }
    return { ok: false, code: 'CHALLENGE_INVALID', error };
  }
}

export default {
  isWalletSessionSignatureRequired,
  canIssueWalletSessionChallenge,
  issueWalletSessionChallenge,
  verifyWalletSessionChallenge,
};
