import {
  CLASSIFICATION_SCHEMES,
  buildClassificationEntries,
  getClassificationLabels,
  getFordCodesFromClassification,
  getIscedCodesFromClassification,
  getSuggestedIscedCodes,
  normalizeClassificationEntries,
} from '../labClassifications'

describe('labClassifications', () => {
  test('builds ERC-721 classification entries with FORD required and ISCED-F contextual', () => {
    const classification = buildClassificationEntries({
      fordCodes: ['2.2'],
      iscedCodes: ['071', '061'],
      educationalProgramLinked: true,
    })

    expect(classification).toEqual([
      {
        scheme: CLASSIFICATION_SCHEMES.FORD,
        schemeVersion: 'Frascati Manual 2015',
        code: '2.2',
        label: 'Electrical engineering, electronic engineering, information engineering',
      },
      {
        scheme: CLASSIFICATION_SCHEMES.ISCED_F,
        schemeVersion: 'ISCED-F 2013',
        code: '071',
        label: 'Engineering and engineering trades',
      },
      {
        scheme: CLASSIFICATION_SCHEMES.ISCED_F,
        schemeVersion: 'ISCED-F 2013',
        code: '061',
        label: 'Information and Communication Technologies (ICTs)',
      },
    ])
  })

  test('omits ISCED-F when the lab is not linked to educational programs', () => {
    const classification = buildClassificationEntries({
      fordCodes: ['1.3'],
      iscedCodes: ['053'],
      educationalProgramLinked: false,
    })

    expect(classification).toHaveLength(1)
    expect(classification[0].scheme).toBe(CLASSIFICATION_SCHEMES.FORD)
  })

  test('rejects legacy category strings and unknown classification codes', () => {
    expect(normalizeClassificationEntries(['Physics'])).toEqual([])
    expect(normalizeClassificationEntries([{ scheme: CLASSIFICATION_SCHEMES.FORD, code: 'physics' }])).toEqual([])
  })

  test('extracts visible category labels only from valid FORD classification', () => {
    const classification = buildClassificationEntries({ fordCodes: ['1.4', '2.4'] })

    expect(getClassificationLabels(classification)).toEqual([
      'Chemical sciences',
      'Chemical engineering',
    ])
    expect(getFordCodesFromClassification(classification)).toEqual(['1.4', '2.4'])
    expect(getIscedCodesFromClassification(classification)).toEqual([])
  })

  test('suggests common ISCED-F fields from selected FORD codes', () => {
    expect(getSuggestedIscedCodes(['2.2', '1.2'])).toEqual(['071', '061'])
  })
})
