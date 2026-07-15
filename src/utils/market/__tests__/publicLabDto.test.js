import {
  PUBLIC_MARKET_LAB_FIELDS,
  sanitizePublicImage,
  toPublicMarketLab,
} from '../publicLabDto'

describe('public market lab DTO', () => {
  test('exposes only the intentional catalogue fields', () => {
    const result = toPublicMarketLab({
      id: 7,
      name: 'Public Lab',
      provider: 'Visible Provider',
      providerInfo: {
        name: 'Visible Provider',
        email: 'private@example.edu',
        account: '0x123',
      },
      accessURI: 'https://private.example/access',
      accessKey: 'private-key',
      uri: 'Lab-Provider-7.json',
      image: 'https://images.example/lab.png',
      price: '100000',
      priceUnit: 'day',
      category: ['Physics'],
      reputation: {
        score: 4.5,
        totalEvents: 12,
        ownerCancellations: 3,
        lastUpdated: 123,
      },
      resourceType: 1,
      isListed: true,
      demoEnabled: true,
    })

    expect(result).toEqual({
      id: 7,
      name: 'Public Lab',
      provider: 'Visible Provider',
      image: 'https://images.example/lab.png',
      price: '100000',
      priceUnit: 'day',
      category: ['Physics'],
      rating: { score: 4.5, totalEvents: 12 },
      resourceType: 1,
      isListed: true,
      demoEnabled: true,
    })
    expect(Object.keys(result).sort()).toEqual([...PUBLIC_MARKET_LAB_FIELDS].sort())
    expect(result).not.toHaveProperty('accessURI')
    expect(result).not.toHaveProperty('accessKey')
    expect(result).not.toHaveProperty('uri')
    expect(result).not.toHaveProperty('providerInfo')
  })

  test('does not expose a wallet address as the provider display name', () => {
    expect(toPublicMarketLab({ id: 1, provider: '0x1...abc' }).provider).toBe('Unknown Provider')
    expect(toPublicMarketLab({ id: 1, provider: '0x1234567890123456789012345678901234567890' }).provider)
      .toBe('Unknown Provider')
  })

  test('does not create a rating object when there are no events', () => {
    expect(toPublicMarketLab({
      id: 8,
      reputation: { score: 0, totalEvents: 0 },
    }).rating).toBeNull()
  })

  test('rejects unsafe or non-HTTPS image references', () => {
    expect(sanitizePublicImage('javascript:alert(1)')).toBe('')
    expect(sanitizePublicImage('http://images.example/lab.png')).toBe('')
    expect(sanitizePublicImage('data:image/svg+xml,<svg></svg>')).toBe('')
    expect(sanitizePublicImage('/labs/lab.png')).toBe('/labs/lab.png')
  })
})
