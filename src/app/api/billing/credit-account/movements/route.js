import { handleGuardError } from '@/utils/auth/guards'
import { proxyCreditAccount } from '@/utils/billing/creditAccountProxy'

export async function GET(request) {
  try { return await proxyCreditAccount('movements', request) } catch (error) { return handleGuardError(error, request) }
}
