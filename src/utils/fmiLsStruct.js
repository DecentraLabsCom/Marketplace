const MANIFEST_NAME = 'org.fmi-standard.fmi-ls-struct'
const MAP_KIND_PREFIX = `${MANIFEST_NAME}.map.`
const MATCHING_RULE = `${MANIFEST_NAME}.map`
const RECTILINEAR_KIND = `${MAP_KIND_PREFIX}rectilinearGrid`
const IRREGULAR_KIND = `${MAP_KIND_PREFIX}irregular`
const MAP_TERMINAL_KINDS = new Set([RECTILINEAR_KIND, IRREGULAR_KIND])
const DOMAIN_KIND = `${MANIFEST_NAME}.map.domain`
const DOMAIN_INPUT_KIND = `${MANIFEST_NAME}.map.domainInput`
const CODOMAIN_KIND = `${MANIFEST_NAME}.map.codomain`
const CODOMAIN_OUTPUT_KIND = `${MANIFEST_NAME}.map.codomainOutput`
const ORDERING_CONSTRAINTS = new Set([
  'unordered', 'increasing', 'decreasing', 'strictlyIncreasing', 'strictlyDecreasing',
])
const NUMERIC_FMI_TYPES = new Set([
  'Real', 'Float32', 'Float64', 'Integer', 'Int8', 'UInt8', 'Int16', 'UInt16',
  'Int32', 'UInt32', 'Int64', 'UInt64',
])
const INTEGER_FMI_TYPES = new Set([
  'Integer', 'Int8', 'UInt8', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64',
])
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
      const hasOrderingConstraint = Object.prototype.hasOwnProperty.call(member || {}, 'orderingConstraint')
      if (!member || typeof member !== 'object' || Array.isArray(member)
        || typeof member.variableName !== 'string' || !member.variableName || member.variableName.length > 512
        || typeof member.memberName !== 'string' || !member.memberName || member.memberName.length > 256
        || typeof member.variableKind !== 'string' || !member.variableKind || member.variableKind.length > 256
        || (knownVariables && !knownVariables.has(member.variableName))
        || memberNames.has(member.memberName) || memberVariables.has(member.variableName)
        || (hasOrderingConstraint && (member.variableKind !== DOMAIN_KIND
          || map.terminalKind !== RECTILINEAR_KIND
          || !ORDERING_CONSTRAINTS.has(member.orderingConstraint)))) {
        valid = false
        break
      }
      members.push({
        variableName: member.variableName,
        memberName: member.memberName,
        variableKind: member.variableKind,
        ...(hasOrderingConstraint ? { orderingConstraint: member.orderingConstraint } : {}),
      })
      memberNames.add(member.memberName)
      memberVariables.add(member.variableName)
    }
    if (!valid || !hasValidMapMemberOrder(members)) continue

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

function hasValidMapMemberOrder(members) {
  const domains = members.map((member, index) => member.variableKind === DOMAIN_KIND ? index : -1).filter((index) => index >= 0)
  const codomains = members.map((member, index) => member.variableKind === CODOMAIN_KIND ? index : -1).filter((index) => index >= 0)
  if (domains.length === 0 || codomains.length === 0) return false
  const firstCodomain = Math.min(...codomains)
  const lastDomain = Math.max(...domains)
  return members.every((member, index) => {
    const { variableKind } = member
    if ([DOMAIN_KIND, DOMAIN_INPUT_KIND].includes(variableKind) && index >= firstCodomain) return false
    if ([CODOMAIN_KIND, CODOMAIN_OUTPUT_KIND].includes(variableKind) && index <= lastDomain) return false
    if (variableKind === DOMAIN_INPUT_KIND) return index > 0 && members[index - 1].variableKind === DOMAIN_KIND
    if (variableKind === CODOMAIN_OUTPUT_KIND) return index > 0 && members[index - 1].variableKind === CODOMAIN_KIND
    return variableKind === DOMAIN_KIND || variableKind === CODOMAIN_KIND || !variableKind.startsWith(MAP_KIND_PREFIX)
  })
}

function inspectArrayShape(value) {
  if (!Array.isArray(value)) return { shape: [], values: [value], rectangular: true }
  if (value.length === 0) return { shape: [0], values: [], rectangular: true }

  const children = value.map(inspectArrayShape)
  const childShape = children[0].shape
  const rectangular = children.every((child) => child.rectangular
    && child.shape.length === childShape.length
    && child.shape.every((size, index) => size === childShape[index]))
  return {
    shape: rectangular ? [value.length, ...childShape] : null,
    values: children.flatMap((child) => child.values),
    rectangular,
  }
}

function numericArray(value) {
  let raw = []
  let actualShape = null
  try {
    if (Array.isArray(value)) {
      const inspected = inspectArrayShape(value)
      if (!inspected.rectangular) return { values: [], actualShape: null, malformedArray: true }
      raw = inspected.values
      actualShape = inspected.shape
    } else if (typeof value === 'number') {
      raw = [value]
    } else if (typeof value === 'string') {
      raw = value.trim().split(/[\s,]+/).filter(Boolean)
    }
  } catch {
    return { values: [], actualShape: null, malformedArray: true }
  }
  if (raw.length > 4096 || raw.some((item) => !['number', 'string'].includes(typeof item) || String(item).trim() === '')) {
    return { values: [], actualShape, malformedArray: false }
  }
  const values = raw.map(Number)
  return {
    values: values.every(Number.isFinite) ? values : [],
    actualShape,
    malformedArray: false,
  }
}

function findDimensionVariable(dimension, variables) {
  if (typeof dimension?.variableName === 'string') {
    const namedVariable = variables.get(dimension.variableName)
    if (namedVariable) return namedVariable
  }
  if (dimension?.valueReference !== undefined && dimension?.valueReference !== null) {
    return [...variables.values()].find((variable) => (
      variable?.valueReference !== undefined
      && String(variable.valueReference) === String(dimension.valueReference)
    )) || null
  }
  return null
}

function scalarPositiveInteger(value) {
  if (Array.isArray(value) || typeof value === 'boolean' || value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function resolvedDimensions(variable, variables, values) {
  if (!Array.isArray(variable?.dimensions)) return []
  return variable.dimensions.map((dimension) => {
    if (Number.isInteger(dimension?.start) && dimension.start > 0) return dimension.start
    const dimensionVariable = findDimensionVariable(dimension, variables)
    if (!dimensionVariable || !INTEGER_FMI_TYPES.has(dimensionVariable.type)
      || (Array.isArray(dimensionVariable.dimensions) && dimensionVariable.dimensions.length > 0)) return null
    const dimensionValue = values?.[dimensionVariable.name] ?? dimensionVariable.start
    const resolved = scalarPositiveInteger(dimensionValue)
    if (resolved !== null) return resolved
    return null
  })
}

function getLatestOutput(outputs, variableName) {
  const series = outputs?.[variableName]
  if (!Array.isArray(series) || series.length === 0) return undefined
  return series[series.length - 1]
}

function describeMember(member, variables, values, outputs, preferOutput = false) {
  const variable = variables.get(member.variableName)
  const value = preferOutput
    ? getLatestOutput(outputs, member.variableName)
    : values?.[member.variableName] ?? variable?.start
  const parsed = numericArray(value)
  return {
    ...member,
    variable,
    label: variable?.displayName || member.memberName,
    unit: typeof variable?.unit === 'string' ? variable.unit : '',
    values: parsed.values,
    actualShape: parsed.actualShape,
    malformedArray: parsed.malformedArray,
    dimensions: resolvedDimensions(variable, variables, values),
    hasNumericValues: parsed.values.length > 0,
  }
}

function validateOneDimensionalMember(member, role, expectedLength = null) {
  const issues = []
  const variable = member.variable
  if (!NUMERIC_FMI_TYPES.has(variable?.type)) {
    issues.push(`${role} “${member.label}” has unsupported FMI type ${variable?.type || 'unknown'}; numeric FMI values are required for a curve.`)
  }
  if (!member.hasNumericValues) {
    issues.push(`${role} “${member.label}” has no finite numeric array values${member.malformedArray ? ' or its nested array is not rectangular' : ''}.`)
  }

  const declaredDimensions = Array.isArray(variable?.dimensions) ? variable.dimensions : null
  if (!declaredDimensions) {
    issues.push(`${role} “${member.label}” has no declared FMI dimensions, so its 1D shape cannot be confirmed.`)
  } else if (declaredDimensions.length !== 1) {
    issues.push(`${role} “${member.label}” declares ${declaredDimensions.length} dimensions; a 1D curve requires exactly one.`)
  } else if (member.actualShape && member.actualShape.length !== 1) {
    issues.push(`${role} “${member.label}” contains rank-${member.actualShape.length} array data; a 1D curve requires rank 1.`)
  } else if (member.dimensions[0] !== null && member.dimensions[0] !== undefined
    && member.hasNumericValues && member.dimensions[0] !== member.values.length) {
    issues.push(`${role} “${member.label}” declares length ${member.dimensions[0]} but provides ${member.values.length} values.`)
  }

  if (expectedLength !== null && member.hasNumericValues && member.values.length !== expectedLength) {
    issues.push(`${role} “${member.label}” has ${member.values.length} samples; the domain has ${expectedLength}.`)
  }

  const unresolvedDynamicLength = declaredDimensions?.length === 1
    && declaredDimensions[0]?.start == null
    && member.dimensions[0] == null
    && member.hasNumericValues
    && !(member.actualShape && member.actualShape.length !== 1)
  return { valid: issues.length === 0, issues, unresolvedDynamicLength }
}

function orderingIssue(values, constraint) {
  if (constraint === 'unordered' || values.length < 2) return null
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]
    const current = values[index]
    const invalid = constraint === 'increasing' ? current < previous
      : constraint === 'decreasing' ? current > previous
        : constraint === 'strictlyIncreasing' ? current <= previous
          : constraint === 'strictlyDecreasing' ? current >= previous : false
    if (invalid) {
      return `Domain “${constraint}” ordering is violated between samples ${index} and ${index + 1}; curve lines are omitted.`
    }
  }
  return null
}

function validateOneDimensionalCurve(map, axes, codomains) {
  const axis = axes[0]
  const axisValidation = validateOneDimensionalMember(axis, 'Domain')
  const diagnostics = [...axisValidation.issues]
  const notes = []
  const series = []
  const axisCanBePlotted = axisValidation.valid
  const orderingConstraint = map.terminalKind === RECTILINEAR_KIND
    ? axis.orderingConstraint || 'unordered'
    : 'unordered'
  let orderingValid = true

  if (axisCanBePlotted && map.terminalKind === RECTILINEAR_KIND) {
    const issue = orderingIssue(axis.values, orderingConstraint)
    if (issue) {
      diagnostics.push(issue)
      orderingValid = false
    }
  }

  let hasValidCodomain = false
  for (const codomain of codomains) {
    const validation = validateOneDimensionalMember(codomain, 'Codomain', axis.values.length)
    diagnostics.push(...validation.issues)
    if (validation.unresolvedDynamicLength) {
      notes.push(`The dynamic length of “${codomain.label}” could not be resolved from metadata; its current one-dimensional sample count is checked against the domain.`)
    }
    if (!axisCanBePlotted || !validation.valid) continue
    hasValidCodomain = true
    series.push({
      name: `${map.name} · ${codomain.label}`,
      mapName: map.name,
      x: sample(axis.values),
      y: sample(codomain.values),
      xLabel: axis.label,
      yLabel: codomain.label,
      xUnit: axis.unit,
      yUnit: codomain.unit,
      orderingConstraint: orderingValid ? orderingConstraint : 'unordered',
    })
  }

  if (axisValidation.unresolvedDynamicLength) {
    notes.push(`The dynamic length of domain “${axis.label}” could not be resolved from metadata; its current one-dimensional sample count is checked against the codomains.`)
  }

  return {
    series,
    diagnostics: [...new Set(diagnostics)],
    notes: [...new Set(notes)],
    supportedValues: axisCanBePlotted && hasValidCodomain,
  }
}

export function getFmiLsStructMapData(value, modelVariables, values = {}, outputs = {}) {
  if (!Array.isArray(modelVariables)) return []
  const variables = new Map(modelVariables
    .filter((variable) => typeof variable?.name === 'string')
    .map((variable) => [variable.name, variable]))
  const metadata = normalizeFmiLsStruct(value, new Set(variables.keys()))
  if (!metadata) return []

  return metadata.maps.slice(0, MAX_RENDERED_MAPS).map((map) => {
    const axes = []
    const codomains = []
    let pendingDomain = null
    let pendingCodomain = null
    for (const member of map.members) {
      if (member.variableKind === DOMAIN_KIND) {
        pendingDomain = describeMember(member, variables, values, outputs)
        axes.push(pendingDomain)
      } else if (member.variableKind === DOMAIN_INPUT_KIND && pendingDomain) {
        pendingDomain.operatingPoint = describeMember(member, variables, values, outputs)
        pendingDomain = null
      } else if (member.variableKind === CODOMAIN_KIND) {
        pendingCodomain = describeMember(member, variables, values, outputs)
        codomains.push(pendingCodomain)
      } else if (member.variableKind === CODOMAIN_OUTPUT_KIND && pendingCodomain) {
        pendingCodomain.currentOutput = describeMember(member, variables, values, outputs, true)
        pendingCodomain = null
      } else {
        pendingDomain = null
        pendingCodomain = null
      }
    }

    const axisSizes = axes.map((axis) => axis.values.length)
    const shape = map.terminalKind === IRREGULAR_KIND
      ? [axisSizes[0] || 0]
      : axisSizes
    const expectedCount = shape.reduce((total, size) => total * size, shape.length ? 1 : 0)
    const codomainShapeValid = codomains.every((codomain) => {
      if (!codomain.hasNumericValues || codomain.values.length !== expectedCount) return false
      if (codomain.dimensions.length === 0) return true
      const expectedShape = map.terminalKind === IRREGULAR_KIND ? [expectedCount] : axisSizes
      return codomain.dimensions.length === expectedShape.length
        && codomain.dimensions.every((size, index) => size === null || size === expectedShape[index])
    })
    const axesValid = axes.length > 0 && axes.every((axis) => (
      axis.hasNumericValues
      && axis.dimensions.length <= 1
      && (axis.dimensions.length === 0 || axis.dimensions[0] === null || axis.dimensions[0] === axis.values.length)
      && (map.terminalKind !== IRREGULAR_KIND || axis.values.length === axisSizes[0])
    ))
    const oneDimensional = axes.length === 1 ? validateOneDimensionalCurve(map, axes, codomains) : null
    const oneDimensionalSeries = oneDimensional?.series || []

    return {
      name: map.name,
      terminalKind: map.terminalKind,
      axes,
      codomains,
      shape,
      expectedCount,
      supportedValues: oneDimensional ? oneDimensional.supportedValues : axesValid && codomainShapeValid,
      isOneDimensional: Boolean(oneDimensional),
      curveDiagnostics: oneDimensional?.diagnostics || [],
      curveNotes: oneDimensional?.notes || [],
      series: oneDimensionalSeries,
    }
  })
}

function sample(values) {
  if (values.length <= MAX_POINTS_PER_MAP) return values
  const indexes = Array.from({ length: MAX_POINTS_PER_MAP }, (_, index) => (
    Math.round(index * (values.length - 1) / (MAX_POINTS_PER_MAP - 1))
  ))
  return indexes.map((index) => values[index])
}

export function getFmiLsStructMapSeries(value, modelVariables) {
  return getFmiLsStructMapData(value, modelVariables).flatMap((map) => map.series)
}
