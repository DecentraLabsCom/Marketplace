const MANIFEST_NAME = 'org.fmi-standard.fmi-ls-struct'
const MAP_KIND_PREFIX = `${MANIFEST_NAME}.map.`
const MATCHING_RULE = `${MANIFEST_NAME}.map`
const MAP_TERMINAL_KINDS = new Set([
  `${MAP_KIND_PREFIX}rectilinearGrid`,
  `${MAP_KIND_PREFIX}irregularGrid`,
])
const DOMAIN_KIND = `${MANIFEST_NAME}.map.domain`
const CODOMAIN_KIND = `${MANIFEST_NAME}.map.codomain`
const MAX_RENDERED_MAPS = 16
const MAX_POINTS_PER_MAP = 256
const MAX_TOTAL_MAP_MEMBERS = 4096

export function normalizeFmiLsStruct(value, knownVariableNames = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.manifestName !== MANIFEST_NAME
    || typeof value.manifestVersion !== 'string' || !value.manifestVersion.trim() || value.manifestVersion.length > 64
    || !Array.isArray(value.maps) || value.maps.length > 128) return null

  const knownVariables = knownVariableNames instanceof Set ? knownVariableNames : null
  const seenMapNames = new Set()
  const maps = []
  let totalMembers = 0
  for (const map of value.maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map)
      || typeof map.name !== 'string' || !map.name.trim() || map.name.length > 256 || seenMapNames.has(map.name)
      || !MAP_TERMINAL_KINDS.has(map.terminalKind)
      || map.matchingRule !== MATCHING_RULE || !Array.isArray(map.members) || map.members.length < 1 || map.members.length > 512) continue
    if (totalMembers + map.members.length > MAX_TOTAL_MAP_MEMBERS) continue

    const memberNames = new Set()
    const memberVariables = new Set()
    const members = []
    let valid = true
    for (const member of map.members) {
      if (!member || typeof member !== 'object' || Array.isArray(member)
        || typeof member.variableName !== 'string' || !member.variableName || member.variableName.length > 512
        || typeof member.memberName !== 'string' || !member.memberName || member.memberName.length > 256
        || typeof member.variableKind !== 'string' || !member.variableKind || member.variableKind.length > 256
        || (knownVariables && !knownVariables.has(member.variableName))
        || memberNames.has(member.memberName) || memberVariables.has(member.variableName)) {
        valid = false
        break
      }
      members.push({
        variableName: member.variableName,
        memberName: member.memberName,
        variableKind: member.variableKind,
      })
      memberNames.add(member.memberName)
      memberVariables.add(member.variableName)
    }
    if (!valid || !members.some((member) => member.variableKind === DOMAIN_KIND)
      || !members.some((member) => member.variableKind === CODOMAIN_KIND)) continue

    maps.push({
      name: map.name.trim(),
      terminalKind: map.terminalKind,
      matchingRule: MATCHING_RULE,
      members,
    })
    seenMapNames.add(map.name)
    totalMembers += members.length
  }
  return { manifestName: MANIFEST_NAME, manifestVersion: value.manifestVersion, maps }
}

function numericArray(value) {
  const raw = Array.isArray(value) ? value.flat(Infinity)
    : typeof value === 'number' ? [value]
      : typeof value === 'string' ? value.trim().split(/[\s,]+/).filter(Boolean) : []
  if (raw.length > 4096 || raw.some((item) => !['number', 'string'].includes(typeof item) || String(item).trim() === '')) return []
  const values = raw.map(Number)
  return values.every(Number.isFinite) ? values : []
}

export function getFmiLsStructMapSeries(value, modelVariables) {
  if (!Array.isArray(modelVariables)) return []
  const variables = new Map(modelVariables
    .filter((variable) => typeof variable?.name === 'string')
    .map((variable) => [variable.name, variable]))
  const metadata = normalizeFmiLsStruct(value, new Set(variables.keys()))
  if (!metadata) return []

  return metadata.maps.flatMap((map) => {
    const domains = map.members.filter((member) => member.variableKind === DOMAIN_KIND)
    const codomains = map.members.filter((member) => member.variableKind === CODOMAIN_KIND)
    if (domains.length !== 1 || codomains.length !== 1) return []
    const xVariable = variables.get(domains[0].variableName)
    const yVariable = variables.get(codomains[0].variableName)
    const xShape = xVariable?.dimensions
    const yShape = yVariable?.dimensions
    if (!Array.isArray(xShape) || xShape.length !== 1 || !Array.isArray(yShape) || yShape.length !== 1
      || !Number.isInteger(xShape[0]?.start) || !Number.isInteger(yShape[0]?.start)
      || xShape[0].start < 2 || xShape[0].start !== yShape[0].start) return []
    const x = numericArray(xVariable?.start)
    const y = numericArray(yVariable?.start)
    if (x.length < 2 || x.length !== y.length || x.length !== xShape[0].start) return []

    const sampledIndices = x.length <= MAX_POINTS_PER_MAP
      ? x.map((_, index) => index)
      : Array.from({ length: MAX_POINTS_PER_MAP }, (_, index) => Math.round(index * (x.length - 1) / (MAX_POINTS_PER_MAP - 1)))
    return [{
      name: map.name,
      x: sampledIndices.map((index) => x[index]),
      y: sampledIndices.map((index) => y[index]),
      xLabel: xVariable.displayName || domains[0].memberName,
      yLabel: yVariable.displayName || codomains[0].memberName,
      xUnit: typeof xVariable.unit === 'string' ? xVariable.unit : '',
      yUnit: typeof yVariable.unit === 'string' ? yVariable.unit : '',
    }]
  }).slice(0, MAX_RENDERED_MAPS)
}
