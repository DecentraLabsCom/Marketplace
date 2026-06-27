import { buildEnrichedLab } from '../labEnrichmentHelpers'

describe('labEnrichmentHelpers', () => {
  test('buildEnrichedLab applies supported marketplace metadata fields and ignores legacy category', () => {
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

  test('buildEnrichedLab does not show categories from incompatible legacy metadata', () => {
    const lab = { labId: 8, base: { uri: 'Lab-provider-8.json' } }
    const metadata = {
      name: 'Legacy Lab',
      category: ['Physics'],
      attributes: [{ trait_type: 'category', value: ['Physics'] }],
    }

    expect(buildEnrichedLab({ lab, metadata })).toMatchObject({
      name: 'Legacy Lab',
    })
    expect(buildEnrichedLab({ lab, metadata }).category).toBeUndefined()
  })
})
