if (!process.env.LHCI_SESSION_COOKIE) {
  throw new Error('LHCI_SESSION_COOKIE is required for authenticated Lighthouse audits')
}

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      settings: {
        extraHeaders: JSON.stringify({ Cookie: process.env.LHCI_SESSION_COOKIE }),
      },
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.7 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.8 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
}
