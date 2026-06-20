import { buildEnrichedLab } from '../labEnrichmentHelpers'

describe('labEnrichmentHelpers', () => {
  test('buildEnrichedLab applies top-level marketplace metadata fields', () => {
    const lab = {
      labId: 7,
      base: {
        uri: 'https://lab.example.edu/lab-content/content/demo/metadata.json'
      }
    }

    const metadata = {
      name: 'Circuit Lab',
      category: ['Electrical Engineering'],
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
      category: ['Electrical Engineering'],
      keywords: ['circuits', 'remote'],
      docs: ['https://lab.example.edu/lab-content/content/demo/docs/manual.pdf'],
      image: 'https://lab.example.edu/lab-content/content/demo/images/cover.png',
      images: [
        'https://lab.example.edu/lab-content/content/demo/images/cover.png',
        'https://lab.example.edu/lab-content/content/demo/images/side.png'
      ]
    })
  })
})
