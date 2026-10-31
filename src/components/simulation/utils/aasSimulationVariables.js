const FMI_VARIABLE_FIELDS = [
  'type',
  'causality',
  'variability',
  'initial',
  'start',
  'min',
  'max',
  'unit',
  'quantity',
  'displayName',
  'displayUnit',
  'nominal',
  'enumItems',
  'dimensions',
  'declaredType',
  'valueReference',
  'description',
]

function areEquivalent(left, right) {
  if (Object.is(left, right)) return true
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') return false
  return JSON.stringify(left) === JSON.stringify(right)
}

function isCompatibleType(aasType, fmiType) {
  if (String(aasType || '').toLowerCase() === String(fmiType || '').toLowerCase()) return true
  const families = {
    Real: ['Float32', 'Float64'],
    Integer: ['Integer', 'Int8', 'UInt8', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64'],
    Enumeration: ['Enumeration'],
    Boolean: ['Boolean'],
    String: ['String'],
  }
  return Object.entries(families).some(([family, members]) => (
    String(aasType || '').toLowerCase() === family.toLowerCase()
    && members.some((member) => member.toLowerCase() === String(fmiType || '').toLowerCase())
  ))
}

/**
 * Use AAS SimulationModels ports as the GLB viewer's display metadata while
 * keeping the FMU description as the execution and safety authority.
 */
export function mergeAasSimulationVariables(aasVariables, fmiVariables) {
  const runtimeVariables = Array.isArray(fmiVariables) ? fmiVariables : []
  if (!Array.isArray(aasVariables) || aasVariables.length === 0 || runtimeVariables.length === 0) {
    return { variables: runtimeVariables, conflicts: [], source: 'fmi' }
  }

  const aasByName = new Map()
  for (const variable of aasVariables) {
    if (!variable || typeof variable.name !== 'string' || !variable.name || aasByName.has(variable.name)) {
      return { variables: runtimeVariables, conflicts: [], source: 'fmi' }
    }
    aasByName.set(variable.name, variable)
  }

  const conflicts = []
  let matched = false
  const variables = runtimeVariables.map((fmiVariable) => {
    const aasVariable = aasByName.get(fmiVariable?.name)
    if (!aasVariable || aasVariable.causality !== fmiVariable.causality
      || !isCompatibleType(aasVariable.type, fmiVariable.type)) {
      if (aasVariable) conflicts.push({ name: fmiVariable.name, field: 'identity' })
      return fmiVariable
    }

    matched = true
    const merged = { ...fmiVariable }
    for (const field of FMI_VARIABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(aasVariable, field) || aasVariable[field] == null) continue

      // Keep a run-safe FMU value if the AAS snapshot disagrees. AAS-only
      // display text can still be curated without affecting execution.
      const presentationField = ['description', 'displayName', 'quantity'].includes(field)
      if (!presentationField
        && Object.prototype.hasOwnProperty.call(fmiVariable, field)
        && !areEquivalent(aasVariable[field], fmiVariable[field])) {
        conflicts.push({ name: fmiVariable.name, field })
        continue
      }
      merged[field] = aasVariable[field]
    }
    return merged
  })

  return {
    variables,
    conflicts,
    source: matched ? 'aas' : 'fmi',
  }
}
