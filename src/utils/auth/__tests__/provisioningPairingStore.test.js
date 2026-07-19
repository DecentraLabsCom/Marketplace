jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(() => true),
  redisCommand: jest.fn(),
}));

import { redisCommand } from '@/utils/redis/restClient';
import {
  createProvisioningPairing,
  getProvisioningPairingByChallenge,
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
});
