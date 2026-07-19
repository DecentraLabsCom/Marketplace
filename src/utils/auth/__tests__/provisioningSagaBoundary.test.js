/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/provisioningReplayStore', () => ({
  advanceProvisioningSaga: jest.fn(),
  markProvisioningReconciliationRequired: jest.fn(),
}));

jest.mock('@/utils/auth/provisioningOperationalAlert', () => ({
  emitProvisioningOperationalAlert: jest.fn(),
}));

import {
  advanceProvisioningSaga,
  markProvisioningReconciliationRequired,
} from '@/utils/auth/provisioningReplayStore';
import { emitProvisioningOperationalAlert } from '@/utils/auth/provisioningOperationalAlert';
import {
  ProvisioningReconciliationRequiredError,
  recordProvisioningResult,
} from '../provisioningSagaBoundary';

describe('recordProvisioningResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    advanceProvisioningSaga.mockResolvedValue({ stage: 'ACTIVE' });
    markProvisioningReconciliationRequired.mockResolvedValue({
      stage: 'RECONCILIATION_REQUIRED',
    });
    emitProvisioningOperationalAlert.mockResolvedValue({ webhookSent: false });
  });

  test('propagates audit failures as a reconciliation-required error and emits an alert', async () => {
    const auditError = new Error('Redis unavailable');
    advanceProvisioningSaga.mockRejectedValue(auditError);

    await expect(recordProvisioningResult('token-jti', {
      stage: 'ACTIVE',
      txHashes: ['0xabc'],
    }, { operation: 'register-provider' })).rejects.toMatchObject({
      code: 'PROVISIONING_RECONCILIATION_REQUIRED',
      status: 503,
    });

    expect(markProvisioningReconciliationRequired).toHaveBeenCalledWith('token-jti', expect.objectContaining({
      errorCode: 'PROVISIONING_AUDIT_WRITE_FAILED',
    }));
    expect(emitProvisioningOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({
      jti: 'token-jti',
      operation: 'register-provider',
      txHashes: ['0xabc'],
      error: auditError,
    }));
  });

  test('returns the persisted transition when audit storage succeeds', async () => {
    const result = await recordProvisioningResult('token-jti', { stage: 'ACTIVE' });

    expect(result).toEqual({ stage: 'ACTIVE' });
    expect(markProvisioningReconciliationRequired).not.toHaveBeenCalled();
    expect(emitProvisioningOperationalAlert).not.toHaveBeenCalled();
  });

  test('retains the reconciliation error type as a public-safe failure', () => {
    const error = new ProvisioningReconciliationRequiredError();

    expect(error).toMatchObject({
      code: 'PROVISIONING_RECONCILIATION_REQUIRED',
      status: 503,
    });
  });
});
