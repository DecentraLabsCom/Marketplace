/**
 * @jest-environment node
 */

import { generateKeyPairSync } from 'node:crypto'
import fs from 'node:fs'
import {
  getMarketplaceJwks,
  getSigningKeyMetadata,
  publicKeyPemToJwk,
} from '../marketplaceJwks'

jest.mock('node:fs', () => ({
  __esModule: true,
  default: {
    readFileSync: jest.fn(),
  },
}))

describe('Marketplace JWKS key material', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.JWT_PRIVATE_KEY
    delete process.env.JWT_PUBLIC_KEY
    delete process.env.JWT_PREVIOUS_PUBLIC_KEY
    fs.readFileSync.mockReset()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('derives a stable RFC 7638 thumbprint kid from a private key', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

    const first = await getSigningKeyMetadata(privateKeyPem)
    const second = await getSigningKeyMetadata(privateKeyPem)

    expect(first.kid).toBe(second.kid)
    expect(first.publicJwk).toMatchObject({
      alg: 'RS256',
      kty: 'RSA',
      kid: first.kid,
      use: 'sig',
    })
    expect(first.publicJwk).not.toHaveProperty('d')
  })

  test('publishes the active key followed by the previous key', async () => {
    const active = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const previous = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const activePrivateKeyPem = active.privateKey.export({ type: 'pkcs8', format: 'pem' })
    const previousPublicKeyPem = previous.publicKey.export({ type: 'spki', format: 'pem' })
    const previousJwk = await publicKeyPemToJwk(previousPublicKeyPem)

    process.env.JWT_PRIVATE_KEY = activePrivateKeyPem
    fs.readFileSync.mockReturnValue(JSON.stringify({ keys: [previousJwk] }))

    const jwks = await getMarketplaceJwks()

    expect(jwks.keys).toHaveLength(2)
    expect(jwks.keys[0].kid).toBe((await getSigningKeyMetadata(activePrivateKeyPem)).kid)
    expect(jwks.keys[1]).toEqual(previousJwk)
    expect(jwks.keys.every((key) => key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig')).toBe(true)
  })

  test('does not publish duplicate active and previous keys', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
    const activeJwk = await publicKeyPemToJwk(publicKeyPem)

    process.env.JWT_PRIVATE_KEY = privateKeyPem
    fs.readFileSync.mockReturnValue(JSON.stringify({ keys: [activeJwk] }))

    const jwks = await getMarketplaceJwks()

    expect(jwks.keys).toEqual([activeJwk])
  })
})
