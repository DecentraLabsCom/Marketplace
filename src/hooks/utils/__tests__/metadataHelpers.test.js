import { processMetadataDocs, processMetadataImages } from '../metadataHelpers'

describe('metadataHelpers', () => {
  test('processMetadataImages prefers top-level fields and removes duplicates', () => {
    const metadata = {
      image: 'https://lab.example.edu/lab-content/content/demo/images/cover.png',
      images: [
        'https://lab.example.edu/lab-content/content/demo/images/cover.png',
        'https://lab.example.edu/lab-content/content/demo/images/side.png'
      ],
      attributes: [
        {
          trait_type: 'additionalImages',
          value: [
            'https://lab.example.edu/lab-content/content/demo/images/side.png',
            'https://lab.example.edu/lab-content/content/demo/images/detail.png'
          ]
        }
      ]
    }

    expect(processMetadataImages(metadata)).toEqual([
      'https://lab.example.edu/lab-content/content/demo/images/cover.png',
      'https://lab.example.edu/lab-content/content/demo/images/side.png',
      'https://lab.example.edu/lab-content/content/demo/images/detail.png'
    ])
  })

  test('processMetadataDocs reads top-level docs with attribute fallback', () => {
    const metadata = {
      docs: ['https://lab.example.edu/lab-content/content/demo/docs/manual.pdf'],
      attributes: [
        {
          trait_type: 'docs',
          value: [
            'https://lab.example.edu/lab-content/content/demo/docs/manual.pdf',
            'https://lab.example.edu/lab-content/content/demo/docs/safety.pdf'
          ]
        }
      ]
    }

    expect(processMetadataDocs(metadata)).toEqual([
      'https://lab.example.edu/lab-content/content/demo/docs/manual.pdf',
      'https://lab.example.edu/lab-content/content/demo/docs/safety.pdf'
    ])
  })
})
