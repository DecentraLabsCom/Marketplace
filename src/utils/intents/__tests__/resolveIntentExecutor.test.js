/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}));

import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { resolveIntentExecutorForInstitution } from '../resolveIntentExecutor';

const INSTITUTION = '0x1111111111111111111111111111111111111111';
const AUTHORIZED_BACKEND = '0x2222222222222222222222222222222222222222';
const ADMIN_EXECUTOR = '0x3333333333333333333333333333333333333333';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('resolveIntentExecutorForInstitution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTENT_EXECUTOR_ADDRESS = ADMIN_EXECUTOR;
  });

  afterAll(() => {
    delete process.env.INTENT_EXECUTOR_ADDRESS;
  });

  test('returns the authorized institutional backend', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionWalletByOrganizationHash: jest.fn().mockResolvedValue(INSTITUTION),
      getAuthorizedBackend: jest.fn().mockResolvedValue(AUTHORIZED_BACKEND),
    });

    await expect(resolveIntentExecutorForInstitution('example.edu'))
      .resolves.toBe(AUTHORIZED_BACKEND);
  });

  test('fails closed when an existing institution has no authorized backend', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionWalletByOrganizationHash: jest.fn().mockResolvedValue(INSTITUTION),
      getAuthorizedBackend: jest.fn().mockResolvedValue(ZERO_ADDRESS),
    });

    await expect(resolveIntentExecutorForInstitution('example.edu'))
      .rejects.toThrow('Institutional backend executor is not authorized');
  });

  test('does not use the administrative fallback when backend lookup fails', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionWalletByOrganizationHash: jest.fn().mockResolvedValue(INSTITUTION),
      getAuthorizedBackend: jest.fn().mockRejectedValue(new Error('RPC unavailable')),
    });

    await expect(resolveIntentExecutorForInstitution('example.edu'))
      .rejects.toThrow('Unable to resolve institutional backend executor');
  });
});
