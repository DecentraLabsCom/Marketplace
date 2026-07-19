import {
  deriveProvisioningStage,
  isProvisioningStageAhead,
} from '../provisioningReconciliation';

describe('provisioning reconciliation', () => {
  test('repairs provider saga stages from confirmed on-chain reads', () => {
    expect(deriveProvisioningStage({
      registrationType: 'provider',
      walletVerified: true,
      providerRegistered: true,
      institutionRoleGranted: true,
      backendRegistered: true,
    })).toBe('ACTIVE');
  });

  test('does not claim a role or backend stage before chain state confirms it', () => {
    expect(deriveProvisioningStage({
      registrationType: 'consumer',
      walletVerified: true,
      institutionRoleGranted: false,
      backendRegistered: true,
    })).toBe('WALLET_VERIFIED');
  });

  test('treats reconciliation-required as behind every confirmed stage', () => {
    expect(isProvisioningStageAhead('RECONCILIATION_REQUIRED', 'BACKEND_REGISTERED')).toBe(true);
    expect(isProvisioningStageAhead('FAILED', 'PROVIDER_ADDED')).toBe(false);
  });
});
