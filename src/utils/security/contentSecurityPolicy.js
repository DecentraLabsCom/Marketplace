const SOURCE_TOKEN_PATTERN = /^[A-Za-z0-9*._:/?=-]+$/

const readConfiguredSources = (...names) => names
  .flatMap((name) => String(process.env[name] || '').split(','))
  .map((source) => source.trim())
  .filter((source) => source && SOURCE_TOKEN_PATTERN.test(source))

const unique = (values) => [...new Set(values)]

const defaultImageSources = () => unique([
  "'self'",
  'data:',
  'blob:',
  'https://*.blob.vercel-storage.com',
  'https://ipfs.io',
  'https://cloudflare-ipfs.com',
  'https://gateway.pinata.cloud',
  'https://nftstorage.link',
  ...readConfiguredSources('CSP_IMG_SRC', 'NEXT_PUBLIC_CSP_IMG_SRC'),
])

const defaultConnectSources = () => {
  const configured = readConfiguredSources('CSP_CONNECT_SRC', 'NEXT_PUBLIC_CSP_CONNECT_SRC')
  // Institutional API calls are relayed through Marketplace same-origin routes.
  // Deployments may add narrowly scoped browser connections when genuinely needed.
  return unique([
    "'self'",
    ...configured,
  ])
}

const frameSources = () => unique([
  "'self'",
  ...readConfiguredSources('CSP_FRAME_SRC', 'NEXT_PUBLIC_CSP_FRAME_SRC'),
])

export function buildContentSecurityPolicy({ nonce, isDevelopment = false } = {}) {
  if (!nonce) throw new Error('CSP nonce is required')

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    isDevelopment ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    isDevelopment ? "style-src-elem 'self' 'unsafe-inline'" : `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${defaultImageSources().join(' ')}`,
    `connect-src ${defaultConnectSources().join(' ')}`,
    `frame-src ${frameSources().join(' ')}`,
    "frame-ancestors 'none'",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]

  if (!isDevelopment) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

