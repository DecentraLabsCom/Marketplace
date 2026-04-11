jest.mock('@/utils/env/baseUrl', () => jest.fn(() => 'https://market.example.com/'))

import {
  buildProviderLabUri,
  createEmptyLabDraft,
  isLabIdListCache,
  remapMovedLabAssetPaths,
  resolveOnchainLabUri,
  sanitizeProviderNameForUri,
} from '../providerDashboard.helpers'

describe('providerDashboard.helpers', () => {
  test('createEmptyLabDraft returns fresh nested structures', () => {
    const first = createEmptyLabDraft()
    const second = createEmptyLabDraft()

    first.availableHours.start = '09:00'
    first.termsOfUse.url = 'https://example.com/terms'
    first.images.push('/tmp/image.png')

    expect(second.availableHours.start).toBe('')
    expect(second.termsOfUse.url).toBe('')
    expect(second.images).toEqual([])
  })

  test('sanitizeProviderNameForUri normalizes provider names for local JSON files', () => {
    expect(sanitizeProviderNameForUri('  UNED / Remote Labs  ')).toBe('UNED-Remote-Labs')
    expect(sanitizeProviderNameForUri('***')).toBe('Provider')
  })

  test('buildProviderLabUri preserves explicit URIs and creates local defaults otherwise', () => {
    expect(buildProviderLabUri('https://external.test/lab.json', 'UNED', 7)).toBe(
      'https://external.test/lab.json'
    )
    expect(buildProviderLabUri('', 'UNED / Labs', 7)).toBe('Lab-UNED-Labs-7.json')
  })

  test('isLabIdListCache distinguishes plain id caches from enriched lab objects', () => {
    expect(isLabIdListCache([1, '2', 3n, null, undefined])).toBe(true)
    expect(isLabIdListCache([{ id: 1 }])).toBe(false)
  })

  test('resolveOnchainLabUri keeps external URIs and resolves local ones through blob or metadata endpoints', () => {
    expect(resolveOnchainLabUri('https://cdn.example.com/lab.json')).toBe(
      'https://cdn.example.com/lab.json'
    )

    expect(
      resolveOnchainLabUri('Lab-UNED-3.json', {
        blobBaseUrl: 'https://blob.example.com/',
      })
    ).toBe('https://blob.example.com/data/Lab-UNED-3.json')

    expect(
      resolveOnchainLabUri('Lab-UNED-3.json', {
        blobBaseUrl: '',
      })
    ).toBe('https://market.example.com/api/metadata?uri=Lab-UNED-3.json')
  })

  test('remapMovedLabAssetPaths rewrites uploaded file paths and falls back to moved assets when needed', () => {
    const movedFiles = [
      { original: '/tmp/images/cover.png', new: '/data/42/images/cover.png' },
      { original: '/tmp/docs/guide.pdf', new: '/data/42/docs/guide.pdf' },
    ]

    expect(
      remapMovedLabAssetPaths(
        {
          images: ['/tmp/images/cover.png'],
          docs: ['/tmp/docs/guide.pdf'],
        },
        movedFiles
      )
    ).toEqual({
      images: ['/data/42/images/cover.png'],
      docs: ['/data/42/docs/guide.pdf'],
    })

    expect(
      remapMovedLabAssetPaths(
        {
          images: [],
          docs: [],
        },
        movedFiles
      )
    ).toEqual({
      images: ['/data/42/images/cover.png'],
      docs: ['/data/42/docs/guide.pdf'],
    })
  })
})
