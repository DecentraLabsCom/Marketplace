export function getSecurityHeaders({ isProduction = false } = {}) {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Permissions-Policy',
      value: 'accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), xr-spatial-tracking=()',
    },
    ...(isProduction
      ? [{
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        }]
      : []),
  ]
}

