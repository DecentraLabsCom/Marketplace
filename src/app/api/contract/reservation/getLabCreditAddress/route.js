// Static config route — no on-chain call needed.
// Does not use createContractHandler because the credit ledger lives inside
// the Diamond; the address is resolved from deployment config, not a contract read.
import { contractAddresses, deploymentModel } from '@/contracts/diamond'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

export async function GET() {
  try {
    await requireAuth()
  } catch (error) {
    return handleGuardError(error)
  }

  const chainKey = (defaultChain?.name || '').toLowerCase()
  const ledgerAddress = contractAddresses[chainKey] || null

  return Response.json({
    labCreditAddress: ledgerAddress,
    ledgerAddress,
    ledgerType: deploymentModel,
    externalToken: false,
  })
}

