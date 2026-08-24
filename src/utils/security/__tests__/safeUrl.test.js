import { buildDemoAccessUrl } from '../safeUrl'

describe('buildDemoAccessUrl', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalDemoHttpFlag = process.env.NEXT_PUBLIC_DEMO_ALLOW_HTTP_DEV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalDemoHttpFlag === undefined) delete process.env.NEXT_PUBLIC_DEMO_ALLOW_HTTP_DEV
    else process.env.NEXT_PUBLIC_DEMO_ALLOW_HTTP_DEV = originalDemoHttpFlag
  })

  test('binds the gateway handoff to the canonical lab ID', () => {
    expect(buildDemoAccessUrl(
      'https://demo.example.com/guacamole?stale=1',
      '0042',
    )).toBe('https://demo.example.com/auth/demo?labId=42')
  })

  test('rejects a missing or non-numeric lab ID', () => {
    expect(buildDemoAccessUrl('https://demo.example.com/guacamole', null)).toBeNull()
    expect(buildDemoAccessUrl('https://demo.example.com/guacamole', 'lab-42')).toBeNull()
  })

  test('rejects HTTP gateway origins by default', () => {
    expect(buildDemoAccessUrl('http://demo.example.com/guacamole', '42')).toBeNull()
  })

  test('allows HTTP only for loopback development with an explicit flag', () => {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_DEMO_ALLOW_HTTP_DEV = 'true'

    expect(buildDemoAccessUrl('http://localhost:3001/guacamole', '42'))
      .toBe('http://localhost:3001/auth/demo?labId=42')
    expect(buildDemoAccessUrl('http://demo.example.com/guacamole', '42')).toBeNull()
  })

  test('never allows HTTP in production even when the development flag is set', () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_DEMO_ALLOW_HTTP_DEV = 'true'

    expect(buildDemoAccessUrl('http://localhost:3001/guacamole', '42')).toBeNull()
  })
})
