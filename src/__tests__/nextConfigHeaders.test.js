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

  test.each([
    '/api/aas/digital-twin-app/:path*',
    '/api/dev/:demo/app/:path*',
  ])('allows the sandboxed digital twin app document to render in its iframe (%s)', async (source) => {
    const rules = await nextConfig.headers()
    const appRule = rules.find(({ source: ruleSource }) => ruleSource === source)

    expect(appRule?.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      ])
    )
  })
})
