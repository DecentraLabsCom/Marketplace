export const PROVISIONING_STAGE_ORDER = Object.freeze([
  'TOKEN_ISSUED',
  'WALLET_VERIFIED',
  'PROVIDER_ADDED',
  'INSTITUTION_ROLE_GRANTED',
  'BACKEND_REGISTERED',
  'ACTIVE',
]);

const stageRank = (stage) => {
  const index = PROVISIONING_STAGE_ORDER.indexOf(stage);
  return index >= 0 ? index : -1;
};

export function deriveProvisioningStage({
  registrationType,
  walletVerified = false,
  providerRegistered = false,
  institutionRoleGranted = false,
  backendRegistered = false,
} = {}) {
  if (!walletVerified) return 'TOKEN_ISSUED';
  if (registrationType === 'provider' && !providerRegistered) return 'WALLET_VERIFIED';
  if (!institutionRoleGranted) {
    return registrationType === 'provider' ? 'PROVIDER_ADDED' : 'WALLET_VERIFIED';
  }
  if (!backendRegistered) return 'INSTITUTION_ROLE_GRANTED';
  return 'ACTIVE';
}

export function isProvisioningStageAhead(candidateStage, currentStage) {
  if (candidateStage === 'RECONCILIATION_REQUIRED') return true;
  if (candidateStage === 'FAILED') return false;
  return stageRank(candidateStage) > stageRank(currentStage);
}
