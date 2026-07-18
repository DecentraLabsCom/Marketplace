import { buildEnrichedLab, normalizeLabIds } from '../labEnrichmentHelpers'

describe('labEnrichmentHelpers', () => {
  test('normalizes numeric and bigint lab IDs consistently', () => {
    expect(normalizeLabIds([1, 1n, '2', { tokenId: 3 }, '2'])).toEqual([1, 2, 3])
  })

  test('buildEnrichedLab applies supported marketplace metadata fields and ignores unsupported category', () => {
    const lab = {
      labId: 7,
      base: {
        uri: 'https://lab.example.edu/lab-content/content/demo/metadata.json'
      }
    }

    const metadata = {
      name: 'Circuit Lab',
      category: ['Electrical Engineering'],
      classification: [
        {
          scheme: 'OECD-FORD',
          schemeVersion: 'Frascati Manual 2015',
          code: '2.2',
          label: 'Electrical engineering, electronic engineering, information engineering',
        },
      ],
      keywords: ['circuits', 'remote'],
      docs: ['https://lab.example.edu/lab-content/content/demo/docs/manual.pdf'],
      image: 'https://lab.example.edu/lab-content/content/demo/images/cover.png',
      images: [
        'https://lab.example.edu/lab-content/content/demo/images/cover.png',
        'https://lab.example.edu/lab-content/content/demo/images/side.png'
      ]
    }

    expect(buildEnrichedLab({ lab, metadata })).toMatchObject({
      name: 'Circuit Lab',
      category: ['Electrical engineering, electronic engineering, information engineering'],
      keywords: ['circuits', 'remote'],
      docs: ['https://lab.example.edu/lab-content/content/demo/docs/manual.pdf'],
      image: 'https://lab.example.edu/lab-content/content/demo/images/cover.png',
      images: [
        'https://lab.example.edu/lab-content/content/demo/images/cover.png',
        'https://lab.example.edu/lab-content/content/demo/images/side.png'
      ]
    })
  })

  test('buildEnrichedLab does not show categories from unsupported metadata', () => {
    const lab = { labId: 8, base: { uri: 'Lab-provider-8.json' } }
    const metadata = {
      name: 'Unclassified Lab',
      category: ['Physics'],
      attributes: [{ trait_type: 'category', value: ['Physics'] }],
    }

    expect(buildEnrichedLab({ lab, metadata })).toMatchObject({
      name: 'Unclassified Lab',
    })
    expect(buildEnrichedLab({ lab, metadata }).category).toBeUndefined()
  })
})
