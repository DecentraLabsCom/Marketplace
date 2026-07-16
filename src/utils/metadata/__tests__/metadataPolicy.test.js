/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}))

describe('metadata egress policy', () => {
  let policy
  let originalFetch
  let dnsLookup

  beforeEach(async () => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_METADATA_ORIGINS = 'https://metadata.example'
    delete process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL
    dnsLookup = require('node:dns/promises').lookup
    dnsLookup.mockReset()
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
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
