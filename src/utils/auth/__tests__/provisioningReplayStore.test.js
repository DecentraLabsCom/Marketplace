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
  startOrResumeProvisioningSaga,
  advanceProvisioningSaga,
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

  test('creates a durable provisioning saga at wallet verification', async () => {
    const saga = await startOrResumeProvisioningSaga(claims);

    expect(saga.resumed).toBe(false);
    expect(saga.record).toMatchObject({
      jti: claims.jti,
      status: 'IN_PROGRESS',
      stage: 'WALLET_VERIFIED',
      lastConfirmedStage: 'WALLET_VERIFIED',
    });
  });

  test('resumes the same saga instead of treating a valid retry as a new write', async () => {
    redisCommand
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({
        ...claims,
        status: 'IN_PROGRESS',
        stage: 'PROVIDER_ADDED',
        lastConfirmedStage: 'PROVIDER_ADDED',
      }));

    const saga = await startOrResumeProvisioningSaga(claims);

    expect(saga).toMatchObject({ resumed: true });
    expect(saga.record.stage).toBe('PROVIDER_ADDED');
  });

  test('persists each confirmed saga stage with its fencing token', async () => {
    redisCommand
      .mockResolvedValueOnce(JSON.stringify({
        jti: claims.jti,
        status: 'IN_PROGRESS',
        stage: 'WALLET_VERIFIED',
      }))
      .mockResolvedValueOnce('OK');

    await advanceProvisioningSaga(claims.jti, {
      stage: 'INSTITUTION_ROLE_GRANTED',
      txHashes: ['0xabc'],
      fencingToken: 7,
    });

    expect(redisCommand.mock.calls[1][0]).toEqual([
      'SET',
      'provisioning:jti:token-jti',
      expect.stringContaining('"stage":"INSTITUTION_ROLE_GRANTED"'),
      'XX',
      'KEEPTTL',
    ]);
  });

  test('marks a failed attempt without discarding the last confirmed stage', async () => {
    redisCommand
      .mockResolvedValueOnce(JSON.stringify({
        jti: claims.jti,
        status: 'IN_PROGRESS',
        stage: 'INSTITUTION_ROLE_GRANTED',
        lastConfirmedStage: 'INSTITUTION_ROLE_GRANTED',
      }))
      .mockResolvedValueOnce('OK');

    const updated = await advanceProvisioningSaga(claims.jti, {
      stage: 'FAILED',
      errorCode: 'RPC_UNAVAILABLE',
    });

    expect(updated).toMatchObject({
      status: 'FAILED',
      stage: 'FAILED',
      lastConfirmedStage: 'INSTITUTION_ROLE_GRANTED',
      errorCode: 'RPC_UNAVAILABLE',
    });
  });
});
