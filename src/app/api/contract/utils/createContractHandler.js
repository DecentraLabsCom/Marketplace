import { getContractInstance } from './contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

const VALIDATORS = {
  number(value, name, { min, max } = {}) {
    const num = Number(value)
    if (isNaN(num) || num < 0) return { error: `Invalid ${name} - must be a non-negative number` }
    if (min !== undefined && num < min) return { error: `Invalid ${name} - must be at least ${min}` }
    if (max !== undefined && num > max) return { error: `Invalid ${name} - must be at most ${max}` }
    return { value: num }
  },
  address(value, name) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return { error: `Invalid ${name} address format` }
    return { value }
  },
  bytes32(value, name) {
    if (!value?.startsWith('0x') || value.length !== 66) return { error: `Invalid ${name} - must be a bytes32 hex string` }
    return { value }
  },
  string(value) {
    return { value }
  },
}

export function createContractHandler({
  auth = false,
  contractType = 'diamond',
  params = [],
  method,
  call,
  args,
  transform = (result) => result,
  onError,
  headers,
}) {
  const json = (body, init = {}) =>
    Response.json(body, { ...init, headers: { ...headers, ...init.headers } })

  async function GET(request) {
    if (auth) {
      try {
        await requireAuth()
      } catch (error) {
        return handleGuardError(error)
      }
    }

    try {
      const url = new URL(request.url)
      const parsed = {}

      for (const param of params) {
        const raw = url.searchParams.get(param.name)
        if (raw === null || raw === undefined || raw === '') {
          if (param.optional && param.default !== undefined) {
            parsed[param.name] = param.default
            continue
          }
          return json(
            { error: `Missing required parameter: ${param.name}` },
            { status: 400 }
          )
        }
        const result = VALIDATORS[param.type || 'string'](raw, param.name, param)
        if (result.error) {
          return json({ error: result.error }, { status: 400 })
        }
        parsed[param.name] = result.value
      }

      const contract = await getContractInstance(contractType)
      let result
      if (call) {
        result = await call(contract, parsed)
      } else {
        const contractArgs = args ? args(parsed) : params.map((p) => parsed[p.name])
        result = await contract[method](...contractArgs)
      }

      return json(transform(result, parsed))
    } catch (error) {
      if (onError) {
        const handled = onError(error, arguments[0] ?? request)
        if (handled) return handled
      }
      console.error(`Contract route error [${method}]:`, error)
      return json(
        {
          error: `Failed to call ${method}`,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      )
    }
  }

  return { GET }
}
