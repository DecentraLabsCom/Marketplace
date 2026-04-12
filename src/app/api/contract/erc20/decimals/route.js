// Static config route — no on-chain call needed.
// Does not use createContractHandler because decimals are a compile-time
// constant for the internal credit ledger; there is no contract to query.
import { CREDIT_DECIMALS } from '@/utils/blockchain/creditUnits'

export async function GET() {
  return Response.json({
    decimals: CREDIT_DECIMALS,
    ledgerType: 'internal-credit-ledger',
    fallback: false,
  })
}
