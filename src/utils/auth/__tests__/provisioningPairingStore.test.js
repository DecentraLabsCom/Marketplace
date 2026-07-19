jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(() => true),
  redisCommand: jest.fn(),
}));

import { redisCommand } from '@/utils/redis/restClient';
import {
  createProvisioningPairing,
  getProvisioningPairingByChallenge,
  redeemProvisioningPairingToken,
  transitionProvisioningPairing,
  updateProvisioningPairing,
} from '../provisioningPairingStore';

describe('provisioning pairing store', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a one-time challenge without persisting the raw challenge', async () => {
    redisCommand.mockResolvedValue('OK');

    const pairing = await createProvisioningPairing({
      institutionId: 'example.edu',
      registrationType: 'provider',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });

    expect(pairing.challenge).toMatch(/^0x[0-9a-f]{64}$/);
    const serializedRecord = redisCommand.mock.calls
      .map(([command]) => command)
      .find((command) => command[0] === 'SET' && String(command[2]).includes('example.edu'));
    expect(serializedRecord).toBeDefined();
    expect(String(serializedRecord[2])).not.toContain(pairing.challenge);
  });

  test('allows at most one active pairing for an institution and registration type', async () => {
    redisCommand.mockResolvedValueOnce(null);

    await expect(createProvisioningPairing({
      institutionId: 'example.edu',
      registrationType: 'provider',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    })).rejects.toMatchObject({ code: 'ACTIVE_PAIRING_EXISTS', status: 409 });
  });

  test('looks up a pairing by challenge and updates it atomically by key', async () => {
    const pairing = {
      pairingId: 'pairing-1',
      challengeHash: 'hash',
      status: 'AWAITING_BACKEND',
    };
    redisCommand
      .mockResolvedValueOnce('pairing-1')
      .mockResolvedValueOnce(JSON.stringify(pairing))
      .mockResolvedValueOnce(JSON.stringify(pairing))
      .mockResolvedValueOnce('OK');

    await expect(getProvisioningPairingByChallenge(`0x${'22'.repeat(32)}`))
      .resolves.toEqual(pairing);
    await expect(updateProvisioningPairing('pairing-1', { status: 'AWAITING_APPROVAL' }))
      .resolves.toMatchObject({ status: 'AWAITING_APPROVAL' });
    expect(redisCommand.mock.calls.at(-1)[0]).toContain('XX');
  });

  test('uses a compare-and-set transition for the backend offer', async () => {
    const pairing = {
      pairingId: 'pairing-1',
      status: 'AWAITING_BACKEND',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    };
    redisCommand
      .mockResolvedValueOnce(JSON.stringify(pairing))
      .mockResolvedValueOnce(1);

    await expect(transitionProvisioningPairing('pairing-1', 'AWAITING_BACKEND', {
      status: 'AWAITING_APPROVAL',
    })).resolves.toMatchObject({ status: 'AWAITING_APPROVAL' });
    expect(redisCommand.mock.calls.at(-1)[0][0]).toBe('EVAL');
    expect(redisCommand.mock.calls.at(-1)[0][4]).toBe('AWAITING_BACKEND');
  });

  test('redeems an approved token with one atomic terminal transition', async () => {
    const pairing = {
      pairingId: 'pairing-1',
      challengeHash: 'challenge-hash',
      status: 'APPROVED',
      token: 'signed-token',
      tokenPayload: { jti: 'token-jti', expiresAt: 1_800_000_300 },
    };
    const redemption = {
      token: pairing.token,
      payload: pairing.tokenPayload,
      expiresAt: '2026-12-01T00:05:00.000Z',
    };
    redisCommand.mockResolvedValueOnce(JSON.stringify(redemption));

    await expect(redeemProvisioningPairingToken(pairing)).resolves.toEqual(redemption);

    const [command] = redisCommand.mock.calls[0];
    expect(command[0]).toBe('EVAL');
    expect(command[1]).toContain('TOKEN_RETRIEVED');
    expect(command.join(' ')).toContain('challenge-hash');
    expect(command.join(' ')).not.toContain('signed-token');
  });

  test('extends the Redis retention TTL atomically when a token is issued', async () => {
    const pairing = {
      pairingId: 'pairing-1',
      challengeHash: 'challenge-hash',
      institutionId: 'example.edu',
      registrationType: 'provider',
      status: 'AWAITING_APPROVAL',
      expiresAt: Math.floor(Date.now() / 1000) + 10,
    };
    redisCommand
      .mockResolvedValueOnce(JSON.stringify(pairing))
      .mockResolvedValueOnce(1);

    await expect(transitionProvisioningPairing(
      'pairing-1',
      'AWAITING_APPROVAL',
      { status: 'APPROVED', tokenExpiresAt: Math.floor(Date.now() / 1000) + 300 },
      { retentionExpiresAt: Math.floor(Date.now() / 1000) + 300 },
    )).resolves.toMatchObject({ status: 'APPROVED' });

    const [command] = redisCommand.mock.calls.at(-1);
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('3');
    expect(command[1]).toContain('EXPIRE');
  });
});
