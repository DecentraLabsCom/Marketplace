export const CLASSIFICATION_SCHEMES = {
  FORD: 'OECD-FORD',
  ISCED_F: 'ISCED-F',
}

export const CLASSIFICATION_SCHEME_VERSIONS = {
  [CLASSIFICATION_SCHEMES.FORD]: 'Frascati Manual 2015',
  [CLASSIFICATION_SCHEMES.ISCED_F]: 'ISCED-F 2013',
}

export const FORD_FIELDS_GROUPED = {
  '1 Natural Sciences': [
    { code: '1.1', label: 'Mathematics' },
    { code: '1.2', label: 'Computer and information sciences' },
    { code: '1.3', label: 'Physical sciences' },
    { code: '1.4', label: 'Chemical sciences' },
    { code: '1.5', label: 'Earth and related environmental sciences' },
    { code: '1.6', label: 'Biological sciences' },
    { code: '1.7', label: 'Other natural sciences' },
  ],
  '2 Engineering and Technology': [
    { code: '2.1', label: 'Civil engineering' },
    { code: '2.2', label: 'Electrical engineering, electronic engineering, information engineering' },
    { code: '2.3', label: 'Mechanical engineering' },
    { code: '2.4', label: 'Chemical engineering' },
    { code: '2.5', label: 'Materials engineering' },
    { code: '2.6', label: 'Medical engineering' },
    { code: '2.7', label: 'Environmental engineering' },
    { code: '2.8', label: 'Environmental biotechnology' },
    { code: '2.9', label: 'Industrial biotechnology' },
    { code: '2.10', label: 'Nano-technology' },
    { code: '2.11', label: 'Other engineering and technologies' },
  ],
  '3 Medical and Health Sciences': [
    { code: '3.1', label: 'Basic medicine' },
    { code: '3.2', label: 'Clinical medicine' },
    { code: '3.3', label: 'Health sciences' },
    { code: '3.4', label: 'Medical biotechnology' },
    { code: '3.5', label: 'Other medical sciences' },
  ],
  '4 Agricultural and Veterinary Sciences': [
    { code: '4.1', label: 'Agriculture, forestry, and fisheries' },
    { code: '4.2', label: 'Animal and dairy science' },
    { code: '4.3', label: 'Veterinary science' },
    { code: '4.4', label: 'Agricultural biotechnology' },
    { code: '4.5', label: 'Other agricultural sciences' },
  ],
  '5 Social Sciences': [
    { code: '5.1', label: 'Psychology' },
    { code: '5.2', label: 'Economics and business' },
    { code: '5.3', label: 'Educational sciences' },
    { code: '5.4', label: 'Sociology' },
    { code: '5.5', label: 'Law' },
    { code: '5.6', label: 'Political science' },
    { code: '5.7', label: 'Social and economic geography' },
    { code: '5.8', label: 'Media and communications' },
    { code: '5.9', label: 'Other social sciences' },
  ],
  '6 Humanities and the Arts': [
    { code: '6.1', label: 'History and archaeology' },
    { code: '6.2', label: 'Languages and literature' },
    { code: '6.3', label: 'Philosophy, ethics and religion' },
    { code: '6.4', label: 'Arts' },
    { code: '6.5', label: 'Other humanities' },
  ],
}

export const FORD_FIELDS = Object.values(FORD_FIELDS_GROUPED).flat()

export const ISCED_F_FIELDS = [
  { code: '05', label: 'Natural sciences, mathematics and statistics' },
  { code: '051', label: 'Biological and related sciences' },
  { code: '052', label: 'Environment' },
  { code: '053', label: 'Physical sciences' },
  { code: '054', label: 'Mathematics and statistics' },
  { code: '061', label: 'Information and Communication Technologies (ICTs)' },
  { code: '071', label: 'Engineering and engineering trades' },
  { code: '072', label: 'Manufacturing and processing' },
  { code: '073', label: 'Architecture and construction' },
  { code: '081', label: 'Agriculture' },
  { code: '082', label: 'Forestry' },
  { code: '083', label: 'Fisheries' },
  { code: '084', label: 'Veterinary' },
  { code: '091', label: 'Health' },
  { code: '092', label: 'Welfare' },
  { code: '031', label: 'Social and behavioural sciences' },
  { code: '032', label: 'Journalism and information' },
  { code: '041', label: 'Business and administration' },
  { code: '042', label: 'Law' },
  { code: '011', label: 'Education' },
  { code: '021', label: 'Arts' },
  { code: '022', label: 'Humanities except languages' },
  { code: '023', label: 'Languages' },
]

export const FORD_TO_ISCED_F_SUGGESTIONS = {
  '1.1': ['054'],
  '1.2': ['061'],
  '1.3': ['053'],
  '1.4': ['053', '071'],
  '1.5': ['052', '053'],
  '1.6': ['051'],
  '1.7': ['05'],
  '2.1': ['073', '071'],
  '2.2': ['071', '061'],
  '2.3': ['071'],
  '2.4': ['071', '072'],
  '2.5': ['071', '072'],
  '2.6': ['091', '071'],
  '2.7': ['071', '052'],
  '2.8': ['051', '071'],
  '2.9': ['072', '071'],
  '2.10': ['071', '053'],
  '2.11': ['071'],
  '3.1': ['091'],
  '3.2': ['091'],
  '3.3': ['091', '092'],
  '3.4': ['091', '051'],
  '3.5': ['091'],
  '4.1': ['081', '082', '083'],
  '4.2': ['081'],
  '4.3': ['084'],
  '4.4': ['081', '051'],
  '4.5': ['081'],
  '5.1': ['031'],
  '5.2': ['041', '031'],
  '5.3': ['011'],
  '5.4': ['031'],
  '5.5': ['042'],
  '5.6': ['031'],
  '5.7': ['031', '052'],
  '5.8': ['032'],
  '5.9': ['031'],
  '6.1': ['022'],
  '6.2': ['023'],
  '6.3': ['022'],
  '6.4': ['021'],
  '6.5': ['022'],
}

const byCode = (items) => new Map(items.map(item => [item.code, item]))
const FORD_BY_CODE = byCode(FORD_FIELDS)
const ISCED_BY_CODE = byCode(ISCED_F_FIELDS)

export const getFordField = (code) => FORD_BY_CODE.get(String(code || '').trim()) || null
export const getIscedField = (code) => ISCED_BY_CODE.get(String(code || '').trim()) || null

export const normalizeClassificationEntries = (value) => {
  const entries = Array.isArray(value) ? value : []
  return entries
    .map(entry => {
      const scheme = String(entry?.scheme || '').trim()
      const code = String(entry?.code || '').trim()
      const source = scheme === CLASSIFICATION_SCHEMES.FORD
        ? getFordField(code)
        : scheme === CLASSIFICATION_SCHEMES.ISCED_F
          ? getIscedField(code)
          : null
      if (!source) return null
      return {
        scheme,
        schemeVersion: CLASSIFICATION_SCHEME_VERSIONS[scheme],
        code: source.code,
        label: source.label,
      }
    })
    .filter(Boolean)
}

export const buildClassificationEntries = ({ fordCodes, iscedCodes = [], educationalProgramLinked = false }) => {
  const seen = new Set()
  const add = (scheme, code) => {
    const key = `${scheme}:${code}`
    if (seen.has(key)) return null
    seen.add(key)
    const field = scheme === CLASSIFICATION_SCHEMES.FORD ? getFordField(code) : getIscedField(code)
    if (!field) return null
    return {
      scheme,
      schemeVersion: CLASSIFICATION_SCHEME_VERSIONS[scheme],
      code: field.code,
      label: field.label,
    }
  }

  return [
    ...(Array.isArray(fordCodes) ? fordCodes : [fordCodes]).map(code => add(CLASSIFICATION_SCHEMES.FORD, code)),
    ...(educationalProgramLinked ? (Array.isArray(iscedCodes) ? iscedCodes : [iscedCodes]).map(code => add(CLASSIFICATION_SCHEMES.ISCED_F, code)) : []),
  ].filter(Boolean)
}

export const getFordCodesFromClassification = (classification) => (
  normalizeClassificationEntries(classification)
    .filter(entry => entry.scheme === CLASSIFICATION_SCHEMES.FORD)
    .map(entry => entry.code)
)

export const getIscedCodesFromClassification = (classification) => (
  normalizeClassificationEntries(classification)
    .filter(entry => entry.scheme === CLASSIFICATION_SCHEMES.ISCED_F)
    .map(entry => entry.code)
)

export const getSuggestedIscedCodes = (fordCodes) => {
  const seen = new Set()
  ;(Array.isArray(fordCodes) ? fordCodes : [fordCodes]).forEach(code => {
    ;(FORD_TO_ISCED_F_SUGGESTIONS[String(code || '').trim()] || []).forEach(iscedCode => seen.add(iscedCode))
  })
  return [...seen]
}

export const getClassificationLabels = (classification, scheme = CLASSIFICATION_SCHEMES.FORD) => (
  normalizeClassificationEntries(classification)
    .filter(entry => !scheme || entry.scheme === scheme)
    .map(entry => entry.label)
)
