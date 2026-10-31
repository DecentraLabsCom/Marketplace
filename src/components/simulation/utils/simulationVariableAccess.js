export function canWriteVariableAt(access, name, phase) {
  const writeAt = access?.variables?.[name]?.writeAt
  return Array.isArray(writeAt) && writeAt.includes(phase)
}

export function filterModelVariablesByAccess(modelVariables, access) {
  if (!Array.isArray(modelVariables) || !access?.variables || typeof access.variables !== 'object') return []
  return modelVariables.flatMap((variable) => {
    if (!variable || typeof variable.name !== 'string') return []
    const permission = access.variables[variable.name]
    if (!permission || (permission.read !== true && !(Array.isArray(permission.writeAt) && permission.writeAt.length > 0))) return []
    const visible = { ...variable }
    if (permission.read !== true) delete visible.start
    return [visible]
  })
}

export function getInitializationEditableVariables(modelVariables, access) {
  return filterModelVariablesByAccess(modelVariables, access).filter((variable) => (
    canWriteVariableAt(access, variable.name, 'initialization')
    && (
      variable.causality === 'input'
      || (variable.causality === 'parameter' && variable.variability !== 'constant')
    )
  ))
}

export function getRuntimeWritableInputVariables(modelVariables, access) {
  return filterModelVariablesByAccess(modelVariables, access).filter((variable) => (
    variable.causality === 'input' && canWriteVariableAt(access, variable.name, 'runtime')
  ))
}

export function getRuntimeWritableVariables(modelVariables, access) {
  return filterModelVariablesByAccess(modelVariables, access).filter((variable) => (
    canWriteVariableAt(access, variable.name, 'runtime')
    && (
      variable.causality === 'input'
      || (variable.causality === 'parameter' && variable.variability === 'tunable')
    )
  ))
}
