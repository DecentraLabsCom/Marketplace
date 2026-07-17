import nextConfig from '../../next.config.js'

describe('Next.js security headers', () => {
  test('allows the same-origin document proxy to render inside the PDF iframe', async () => {
    const rules = await nextConfig.headers()
    const documentRule = rules.find(({ source }) => source === '/api/metadata/document')

    expect(documentRule?.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      ])
    )
  })
})
