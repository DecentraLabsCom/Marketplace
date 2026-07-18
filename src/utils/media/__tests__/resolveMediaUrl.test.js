import {
  buildMetadataImageProxyUrl,
  resolveStoredAssetUrl,
} from '../resolveMediaUrl'

describe('resolveMediaUrl', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('keeps local relative assets local during development', () => {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL = 'https://blob.example'

    expect(resolveStoredAssetUrl('/7/images/cover.png')).toBe('/7/images/cover.png')
  })

  test('maps relative assets to Blob storage in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL = 'https://blob.example'

    expect(resolveStoredAssetUrl('/7/images/cover.png')).toBe(
      'https://blob.example/data/7/images/cover.png',
    )
  })

  test('builds a same-origin proxy URL for trusted lab images', () => {
    expect(buildMetadataImageProxyUrl('https://provider.example/cover.png', 7)).toBe(
      '/api/metadata/image?labId=7&uri=https%3A%2F%2Fprovider.example%2Fcover.png',
    )
  })
})

