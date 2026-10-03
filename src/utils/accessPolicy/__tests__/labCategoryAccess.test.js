import { isAccessDenied, normalizeLabCategories } from '@/utils/accessPolicy/labCategoryAccess'

describe('lab category access helpers', () => {
  test('normalizes string, array and attribute metadata without duplicates', () => {
    expect(normalizeLabCategories({ category: 'AI/ML', categories: ['Computer Science'], attributes: [{ trait_type: 'category', value: ['Cybersecurity'] }] }))
      .toEqual(['Artificial Intelligence & Machine Learning', 'Computer Science', 'Cybersecurity'])
  })

  test('only an explicit backend deny blocks access', () => {
    expect(isAccessDenied({ allowed: false })).toBe(true)
    expect(isAccessDenied(null)).toBe(false)
    expect(isAccessDenied({ allowed: true })).toBe(false)
  })
})
