/**
 * Toast notification helpers for staking operations
 * Follows the same pattern as labToasts.js
 */

export const stakingToastIds = {
  stakeStarted: () => 'staking-stake-started',
  stakeSuccess: () => 'staking-stake-success',
  stakeFailed: () => 'staking-stake-failed',
  unstakeStarted: () => 'staking-unstake-started',
  unstakeSuccess: () => 'staking-unstake-success',
  unstakeFailed: () => 'staking-unstake-failed',
  insufficientStake: () => 'staking-insufficient',
}

const notify = (addTemporaryNotification, type, message, dedupeKey, extraOptions = {}) => {
  if (typeof addTemporaryNotification !== 'function') return
  addTemporaryNotification(type, message, null, {
    dedupeKey,
    dedupeWindowMs: 20000,
    ...extraOptions,
  })
}

export const notifyStakeStarted = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'pending', `Staking ${amount} $LAB...`, stakingToastIds.stakeStarted())
}

export const notifyStakeSuccess = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'success', `Successfully staked ${amount} $LAB`, stakingToastIds.stakeSuccess())
}

export const notifyStakeFailed = (addTemporaryNotification, errorMessage) => {
  notify(addTemporaryNotification, 'error', `Stake failed: ${errorMessage}`, stakingToastIds.stakeFailed())
}

export const notifyUnstakeStarted = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'pending', `Unstaking ${amount} $LAB...`, stakingToastIds.unstakeStarted())
}

export const notifyUnstakeSuccess = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'success', `Successfully unstaked ${amount} $LAB`, stakingToastIds.unstakeSuccess())
}

export const notifyUnstakeFailed = (addTemporaryNotification, errorMessage) => {
  notify(addTemporaryNotification, 'error', `Unstake failed: ${errorMessage}`, stakingToastIds.unstakeFailed())
}

export const notifyInsufficientStake = (addTemporaryNotification, deficit) => {
  notify(
    addTemporaryNotification,
    'warning',
    `Insufficient stake — ${deficit} $LAB more needed to list labs`,
    stakingToastIds.insufficientStake()
  )
}
