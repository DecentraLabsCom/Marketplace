import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const limiters = {
  create: createRateLimiter({
    operation: 'provisioning-pairing-create',
    windowMs: 60_000,
    maxRequests: 5,
    limits: { user: 5, institution: 5, ip: 10, anonymousIp: 5 },
  }),
  status: createRateLimiter({
    operation: 'provisioning-pairing-status',
    windowMs: 60_000,
    maxRequests: 30,
    limits: { user: 30, institution: 60, ip: 60, anonymousIp: 30 },
  }),
  approve: createRateLimiter({
    operation: 'provisioning-pairing-approve',
    windowMs: 60_000,
    maxRequests: 10,
    limits: { user: 10, institution: 10, ip: 20, anonymousIp: 10 },
  }),
  cancel: createRateLimiter({
    operation: 'provisioning-pairing-cancel',
    windowMs: 60_000,
    maxRequests: 10,
    limits: { user: 10, institution: 10, ip: 20, anonymousIp: 10 },
  }),
  inspect: createRateLimiter({
    operation: 'provisioning-pairing-inspect',
    windowMs: 60_000,
    maxRequests: 30,
  }),
  offer: createRateLimiter({
    operation: 'provisioning-pairing-offer',
    windowMs: 60_000,
    maxRequests: 10,
  }),
  token: createRateLimiter({
    operation: 'provisioning-pairing-token',
    windowMs: 60_000,
    maxRequests: 5,
  }),
}

export async function provisioningPairingRateLimitResponse(operation, request, identity) {
  const limiter = limiters[operation]
  if (!limiter) throw new Error(`Unknown provisioning pairing rate limit operation: ${operation}`)
  return createRateLimitResponse(await limiter(request, identity), 'Too many provisioning pairing requests')
}
