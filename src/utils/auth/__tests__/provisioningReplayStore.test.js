/**
 * @jest-environment node
 */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}));

import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient';
import {
  ProvisioningReplayError,
  consumeProvisioningJti,
  updateProvisioningAudit,
} from '../provisioningReplayStore';

const claims = {
  jti: 'token-jti',
  institutionId: 'example.edu',
  walletAddress: '0x1234567890123456789012345678901234567890',
  canonicalBackendOrigin: 'https://gateway.example.edu',
  registrationType: 'provider',
  chainId: 11155111,
  registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  nonce: '0x1111111111111111111111111111111111111111111111111111111111111111',
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_000_300,
  responsiblePerson: 'Admin User',
  responsibleEmail: 'admin@example.edu',
};

describe('provisioning jti consumption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasRedisConfig.mockReturnValue(true);
    redisCommand.mockResolvedValue('OK');
  });

  test('atomically reserves the jti and stores audit context', async () => {
    await consumeProvisioningJti(claims);

    expect(redisCommand).toHaveBeenCalledTimes(1);
    const command = redisCommand.mock.calls[0][0];
    expect(command.slice(0, 4)).toEqual([
      'SET',
      'provisioning:jti:token-jti',
      expect.any(String),
      'NX',
    ]);
    expect(command).toContain('EX');
    expect(JSON.parse(command[2])).toMatchObject({
      status: 'consumed',
      institutionId: 'example.edu',
      walletAddress: claims.walletAddress,
      responsibleEmail: 'admin@example.edu',
    });
  });

  test('rejects a token when SET NX reports an existing jti', async () => {
    redisCommand.mockResolvedValue(null);

    await expect(consumeProvisioningJti(claims)).rejects.toBeInstanceOf(
      ProvisioningReplayError
    );
  });

  test('fails closed when shared Redis is unavailable', async () => {
    hasRedisConfig.mockReturnValue(false);

    await expect(consumeProvisioningJti(claims)).rejects.toThrow(
      'Redis is required for provisioning token consumption'
    );
    expect(redisCommand).not.toHaveBeenCalled();
  });

  test('records transaction hashes without changing replay ownership', async () => {
    redisCommand
      .mockResolvedValueOnce(JSON.stringify({ status: 'consumed', jti: claims.jti }))
      .mockResolvedValueOnce('OK');

    await updateProvisioningAudit(claims.jti, {
      status: 'registered',
      txHashes: ['0xabc'],
    });

    expect(redisCommand.mock.calls[1][0]).toEqual([
      'SET',
      'provisioning:jti:token-jti',
      expect.stringContaining('"txHashes":["0xabc"]'),
      'XX',
      'KEEPTTL',
    ]);
  });
});
