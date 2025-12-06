import { ethers } from 'ethers';

export function resolveIntentExecutorAddress() {
  const configured = process.env.INTENT_EXECUTOR_ADDRESS;

  if (!configured) {
    throw new Error('INTENT_EXECUTOR_ADDRESS must be configured to build intents');
  }

  if (!ethers.isAddress(configured)) {
    throw new Error(`Invalid INTENT_EXECUTOR_ADDRESS configured: ${configured}`);
  }

  return configured;
}

export default {
  resolveIntentExecutorAddress,
};
