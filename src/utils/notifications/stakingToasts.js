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
  notify(addTemporaryNotification, 'pending', `Bonding ${amount} credits...`, stakingToastIds.stakeStarted())
}

export const notifyStakeSuccess = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'success', `Successfully bonded ${amount} credits`, stakingToastIds.stakeSuccess())
}

export const notifyStakeFailed = (addTemporaryNotification, errorMessage) => {
  notify(addTemporaryNotification, 'error', `Bond failed: ${errorMessage}`, stakingToastIds.stakeFailed())
}

export const notifyUnstakeStarted = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'pending', `Releasing ${amount} credits...`, stakingToastIds.unstakeStarted())
}

export const notifyUnstakeSuccess = (addTemporaryNotification, amount) => {
  notify(addTemporaryNotification, 'success', `Successfully released ${amount} credits`, stakingToastIds.unstakeSuccess())
}

export const notifyUnstakeFailed = (addTemporaryNotification, errorMessage) => {
  notify(addTemporaryNotification, 'error', `Release failed: ${errorMessage}`, stakingToastIds.unstakeFailed())
}

export const notifyInsufficientStake = (addTemporaryNotification, deficit) => {
  notify(
    addTemporaryNotification,
    'warning',
    `Insufficient bond — ${deficit} credits more needed to list labs`,
    stakingToastIds.insufficientStake()
  )
}

