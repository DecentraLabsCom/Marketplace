/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}))

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

describe('metadata egress policy', () => {
  let policy
  let originalFetch
  let dnsLookup
  let hasRedisConfig
  let redisCommand

  beforeEach(async () => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_METADATA_ORIGINS = 'https://metadata.example/'
    delete process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL
    dnsLookup = require('node:dns/promises').lookup
    dnsLookup.mockReset()
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const redisClient = jest.requireMock('@/utils/redis/restClient')
    hasRedisConfig = redisClient.hasRedisConfig
    redisCommand = redisClient.redisCommand
    hasRedisConfig.mockReturnValue(false)
    redisCommand.mockReset()
    originalFetch = global.fetch
    policy = await import('../metadataPolicy')
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.ALLOWED_METADATA_ORIGINS
    delete process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL
  })

  test('accepts only JSON from an allowlisted public HTTPS origin', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({ name: 'Lab' })).body,
    })

    const result = await policy.fetchMetadataJson('https://metadata.example/lab.json')

    expect(result.data).toEqual({ name: 'Lab' })
    expect(dnsLookup).toHaveBeenCalledWith('metadata.example', { all: true, verbatim: true })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://metadata.example/lab.json',
      expect.objectContaining({ redirect: 'manual', dispatcher: expect.any(Object) }),
    )
  })

  test('accepts metadata from a provider origin supplied by the lab trust resolver', async () => {
    delete process.env.ALLOWED_METADATA_ORIGINS
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({ name: 'Lab' })).body,
    })

    const result = await policy.fetchMetadataJson('https://provider.example/lab.json', {
      additionalAllowedOrigins: ['https://provider.example'],
    })

    expect(result.data).toEqual({ name: 'Lab' })
    expect(global.fetch).toHaveBeenCalled()
  })

  test('accepts metadata from an active reviewed dynamic exception', async () => {
    delete process.env.ALLOWED_METADATA_ORIGINS
    hasRedisConfig.mockReturnValue(true)
    redisCommand
      .mockResolvedValueOnce(['https://research-cdn.example.edu'])
      .mockResolvedValueOnce(JSON.stringify({
        origin: 'https://research-cdn.example.edu',
        owner: 'Research infrastructure team',
        reason: 'Shared metadata CDN',
      }))
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({ name: 'Shared CDN lab' })).body,
    })

    await expect(policy.fetchMetadataJson('https://research-cdn.example.edu/lab.json')).resolves.toMatchObject({
      data: { name: 'Shared CDN lab' },
    })
  })

  test('accepts metadata from the configured Vercel Blob origin', async () => {
    delete process.env.ALLOWED_METADATA_ORIGINS
    process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL = 'https://blob.example'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({ name: 'Blob lab' })).body,
    })

    const result = await policy.fetchMetadataJson('https://blob.example/data/Lab-Provider-7.json')

    expect(result.data).toEqual({ name: 'Blob lab' })
    expect(global.fetch).toHaveBeenCalled()
  })

  test('rejects HTTP metadata even outside production', async () => {
    await expect(policy.fetchMetadataJson('http://metadata.example/lab.json')).rejects.toThrow(
      /HTTPS/
    )
  })

  test('rejects an origin that is not explicitly allowlisted', async () => {
    await expect(policy.fetchMetadataJson('https://evil.example/lab.json')).rejects.toThrow(
      /ALLOWED_METADATA_ORIGINS/
    )
    expect(global.fetch).toBe(originalFetch)
  })

  test('rejects DNS answers containing a private address', async () => {
    dnsLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ])

    await expect(policy.fetchMetadataJson('https://metadata.example/lab.json')).rejects.toThrow(
      /private, loopback, link-local or reserved/
    )
  })

  test('rejects redirects before following them', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'https://metadata.example/other.json' }),
    })

    await expect(policy.fetchMetadataJson('https://metadata.example/lab.json')).rejects.toThrow(
      /redirects are not allowed/
    )
  })

  test('rejects non-JSON content types', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
    })

    await expect(policy.fetchMetadataJson('https://metadata.example/lab.json')).rejects.toThrow(
      /JSON Content-Type/
    )
  })

  test('rejects oversized response bodies before parsing', async () => {
    const oversized = new Uint8Array(1024 * 1024 + 1)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(oversized)
          controller.close()
        },
      }),
    })

    await expect(policy.fetchMetadataJson('https://metadata.example/lab.json')).rejects.toThrow(
      /maximum size/
    )
  })

  test('validates the metadata document shape', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({ name: 42 })).body,
    })

    await expect(policy.fetchMetadataJson('https://metadata.example/lab.json')).rejects.toThrow(
      /metadata document/i
    )
  })

  test('requires an external on-chain tokenURI to use the provider institutional origin or a reviewed exception', async () => {
    delete process.env.ALLOWED_METADATA_ORIGINS
    const { getContractInstance } = jest.requireMock('@/app/api/contract/utils/contractInstance')
    getContractInstance.mockResolvedValue({
      tokenURI: jest.fn().mockResolvedValue('https://metadata.example/lab.json'),
      ownerOf: jest.fn().mockResolvedValue('0x00000000000000000000000000000000000000a1'),
      isLabProvider: jest.fn().mockResolvedValue(true),
      getRegisteredSchacHomeOrganizations: jest.fn().mockResolvedValue(['provider.example']),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue('https://gateway.example'),
    })

    await expect(policy.loadOnChainLabMetadata(7)).rejects.toThrow(/ALLOWED_METADATA_ORIGINS|trusted lab provider origins/)
    expect(global.fetch).toBe(originalFetch)
  })

  test('accepts an external on-chain tokenURI at the provider exact registered backend origin', async () => {
    delete process.env.ALLOWED_METADATA_ORIGINS
    const { getContractInstance } = jest.requireMock('@/app/api/contract/utils/contractInstance')
    getContractInstance.mockResolvedValue({
      tokenURI: jest.fn().mockResolvedValue('https://gateway.example/lab.json'),
      ownerOf: jest.fn().mockResolvedValue('0x00000000000000000000000000000000000000a1'),
      isLabProvider: jest.fn().mockResolvedValue(true),
      getRegisteredSchacHomeOrganizations: jest.fn().mockResolvedValue(['provider.example']),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue('https://gateway.example'),
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({ name: 'Provider lab' })).body,
    })

    await expect(policy.loadOnChainLabMetadata(7)).resolves.toMatchObject({
      metadataUri: 'https://gateway.example/lab.json',
      metadata: { name: 'Provider lab' },
    })
  })

  test('rejects an undeclared image path even when it shares the trusted metadata origin', async () => {
    delete process.env.ALLOWED_METADATA_ORIGINS
    const { getContractInstance } = jest.requireMock('@/app/api/contract/utils/contractInstance')
    getContractInstance.mockResolvedValue({
      tokenURI: jest.fn().mockResolvedValue('https://gateway.example/lab.json'),
      ownerOf: jest.fn().mockResolvedValue('0x00000000000000000000000000000000000000a1'),
      isLabProvider: jest.fn().mockResolvedValue(true),
      getRegisteredSchacHomeOrganizations: jest.fn().mockResolvedValue(['provider.example']),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue('https://gateway.example'),
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify({
        name: 'Provider lab',
        image: 'https://gateway.example/images/declared.webp',
      })).body,
    })

    await expect(policy.assertDeclaredLabResource(
      7,
      'https://gateway.example/internal/unrelated.webp',
      'image',
    )).rejects.toMatchObject({ code: 'RESOURCE_NOT_DECLARED' })
  })

  test('drops undeclared fields and attributes from metadata output', () => {
    expect(policy.validateMetadataDocument({
      name: 'Lab',
      internalNote: 'do not expose',
      attributes: [
        { trait_type: 'docs', value: ['https://metadata.example/guide.pdf'], internalToken: 'secret' },
        { trait_type: 'legacyPrivateField', value: { deeply: { nested: 'secret' } } },
      ],
    })).toEqual({
      name: 'Lab',
      attributes: [{ trait_type: 'docs', value: ['https://metadata.example/guide.pdf'] }],
    })
  })
})
