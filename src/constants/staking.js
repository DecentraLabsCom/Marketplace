/**
 * Staking domain constants derived from smart contract (LibStaking.sol).
 * Single source of truth for display values used across staking UI components.
 *
 * If these values change in the contract, update them here only.
 */

/** Base stake required for a provider to operate (in whole $LAB tokens) */
export const BASE_STAKE_DISPLAY = 800

/** Additional stake required per lab beyond the free tier (in whole $LAB tokens) */
export const STAKE_PER_ADDITIONAL_LAB_DISPLAY = 200

/** Number of labs included in the base stake (no additional stake required) */
export const FREE_LABS_COUNT = 10
