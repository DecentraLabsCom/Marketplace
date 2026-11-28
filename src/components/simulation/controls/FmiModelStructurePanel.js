'use client'

import PropTypes from 'prop-types'

const CAPABILITY_LABELS = Object.freeze({
  needsExecutionTool: 'Requires an execution tool',
  canBeInstantiatedOnlyOncePerProcess: 'One instance per process',
  canNotUseMemoryManagementFunctions: 'Cannot use FMI memory-management functions',
  canRunAsynchronuously: 'Can run asynchronously',
  canGetAndSetFMUstate: 'Get and set FMU state',
  canSerializeFMUstate: 'Serialize FMU state',
  canHandleVariableCommunicationStepSize: 'Variable communication step size',
  canInterpolateInputs: 'Input interpolation',
  hasEventMode: 'FMI Event Mode',
  providesIntermediateUpdate: 'Intermediate updates',
  canReturnEarlyAfterIntermediateUpdate: 'Early return',
  providesEvaluateDiscreteStates: 'Discrete-state evaluation',
  providesDirectionalDerivative: 'Directional derivatives',
  providesAdjointDerivatives: 'Adjoint derivatives',
  providesPerElementDependencies: 'Per-element dependencies',
  needsCompletedIntegratorStep: 'Requires completedIntegratorStep',
  completedIntegratorStepNotNeeded: 'Integrator completion call is optional',
  maxOutputDerivativeOrder: 'Maximum output derivative order',
  recommendedIntermediateInputSmoothness: 'Recommended input smoothness',
  fixedInternalStepSize: 'Fixed internal step size',
})

function capabilityValue(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function relationshipEntries(entries, modelVariables) {
  const byName = new Map(modelVariables.map((variable) => [variable.name, variable]))
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const variableName = typeof entry?.name === 'string'
      ? entry.name
      : (typeof entry?.stateName === 'string' ? entry.stateName : '')
    const variable = byName.get(variableName)
    if (!variableName || !variable) return []
    const stateVariable = typeof entry?.stateName === 'string' ? byName.get(entry.stateName) : null
    const dependencies = Array.isArray(entry.dependencyNames)
      ? entry.dependencyNames.flatMap((name, index) => (
        byName.has(name)
          ? [{ name, kind: Array.isArray(entry.dependenciesKind) ? entry.dependenciesKind[index] : '' }]
          : []
      ))
      : []
    return [{ variable, dependencies, stateVariable }]
  })
}

function RelationshipList({ title, entries, modelVariables }) {
  const relationships = relationshipEntries(entries, modelVariables)
  if (!relationships.length) return null
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-semibold text-[#dce9e9]">{title}</h4>
      <ul className="grid gap-1.5">
        {relationships.map(({ variable, dependencies, stateVariable }) => (
          <li key={variable.name} className="grid gap-0.5 rounded-lg border border-[#26383f] bg-[#0c171c] px-2.5 py-2 text-xs sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)]">
            <span className="truncate font-medium text-[#c8e1e2]" title={variable.name}>
              {variable.displayName || variable.name}
            </span>
            <span className="text-[#91a7ac]">
              {[
                stateVariable ? `State for ${stateVariable.displayName || stateVariable.name}` : '',
                dependencies.length
                  ? `Depends on ${dependencies.map(({ name, kind }) => `${name}${kind ? ` (${kind})` : ''}`).join(', ')}`
                  : 'No accessible dependencies',
              ].filter(Boolean).join(' / ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

RelationshipList.propTypes = {
  title: PropTypes.string.isRequired,
  entries: PropTypes.array,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
}

export default function FmiModelStructurePanel({ metadata, modelVariables = [] }) {
  const structure = metadata?.modelStructure || {}
  const capabilities = metadata?.capabilities || {}
  const modelExchangeCapabilities = metadata?.modelExchangeCapabilities || {}
  const hasCoSimulation = typeof metadata?.supportsCoSimulation === 'boolean'
  const hasModelExchange = typeof metadata?.supportsModelExchange === 'boolean'
  const outputCount = Array.isArray(structure.outputs) ? structure.outputs.length : 0
  const eventEntries = relationshipEntries(structure.eventIndicators, modelVariables)
  const declaredCapabilities = Object.entries(CAPABILITY_LABELS)
    .filter(([name]) => typeof capabilities[name] === 'boolean' || typeof capabilities[name] === 'number')
  const declaredModelExchangeCapabilities = Object.entries(CAPABILITY_LABELS)
    .filter(([name]) => typeof modelExchangeCapabilities[name] === 'boolean' || typeof modelExchangeCapabilities[name] === 'number')
  const hasContent = outputCount > 0
    || relationshipEntries(structure.derivatives, modelVariables).length > 0
    || relationshipEntries(structure.clockedStates, modelVariables).length > 0
    || relationshipEntries(structure.initialUnknowns, modelVariables).length > 0
    || eventEntries.length > 0
    || (Number.isInteger(metadata?.numberOfEventIndicators) && metadata.numberOfEventIndicators > 0)
    || declaredCapabilities.length > 0 || declaredModelExchangeCapabilities.length > 0
    || hasCoSimulation || hasModelExchange
  if (!hasContent) return null

  const eventIndicatorCount = Number.isInteger(metadata?.numberOfEventIndicators)
    ? Math.max(metadata.numberOfEventIndicators, eventEntries.length)
    : eventEntries.length

  return (
    <details className="mb-5 rounded-xl border border-[#26383f] bg-[#101a20]">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#dce9e9] marker:hidden">
        FMI relationships and events
        <span className="ml-2 text-xs font-normal text-[#829ba1]">
          {outputCount} output relationships / {eventIndicatorCount} event indicators
        </span>
      </summary>
      <div className="grid gap-4 border-t border-[#26383f] px-4 py-3">
        {hasCoSimulation || hasModelExchange ? (
          <div className="grid gap-1 text-xs text-[#91a7ac]">
            <h4 className="font-semibold text-[#dce9e9]">Declared execution interfaces</h4>
            {hasCoSimulation ? <p>Co-Simulation: {metadata.supportsCoSimulation ? 'yes' : 'no'}</p> : null}
            {hasModelExchange ? <p>Model Exchange: {metadata.supportsModelExchange ? 'yes' : 'no'}</p> : null}
          </div>
        ) : null}
        {outputCount > 0 ? (
          <RelationshipList title="Output dependencies" entries={structure.outputs} modelVariables={modelVariables} />
        ) : null}
        {Array.isArray(structure.derivatives) && structure.derivatives.length > 0 ? (
          <RelationshipList title="State derivatives" entries={structure.derivatives} modelVariables={modelVariables} />
        ) : null}
        {Array.isArray(structure.clockedStates) && structure.clockedStates.length > 0 ? (
          <RelationshipList title="Clocked states" entries={structure.clockedStates} modelVariables={modelVariables} />
        ) : null}
        {Array.isArray(structure.initialUnknowns) && structure.initialUnknowns.length > 0 ? (
          <RelationshipList title="Initial unknowns" entries={structure.initialUnknowns} modelVariables={modelVariables} />
        ) : null}
        {eventIndicatorCount > 0 ? (
          <div className="grid gap-1 text-xs text-[#91a7ac]">
            <h4 className="font-semibold text-[#dce9e9]">Event indicators</h4>
            <p>{eventIndicatorCount} declared by the FMU. Runtime event and early-return samples appear on the timeline after a run.</p>
            {eventEntries.length > 0 ? <p>{eventEntries.map(({ variable }) => variable.displayName || variable.name).join(', ')}</p> : null}
          </div>
        ) : null}
        {declaredCapabilities.length > 0 || declaredModelExchangeCapabilities.length > 0 ? (
          <div className="grid gap-1.5">
            {declaredCapabilities.length > 0 ? (
              <>
                <h4 className="text-xs font-semibold text-[#dce9e9]">FMI interface capabilities</h4>
                <ul className="grid gap-1 text-xs text-[#91a7ac] sm:grid-cols-2">
                  {declaredCapabilities.map(([name, label]) => (
                    <li key={name}>{label}: {capabilityValue(capabilities[name])}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {declaredModelExchangeCapabilities.length > 0 ? (
              <>
                <h5 className="pt-1 text-xs font-semibold text-[#dce9e9]">Model Exchange capabilities</h5>
                <ul className="grid gap-1 text-xs text-[#91a7ac] sm:grid-cols-2">
                  {declaredModelExchangeCapabilities.map(([name, label]) => (
                    <li key={name}>{label}: {capabilityValue(modelExchangeCapabilities[name])}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="text-[10px] text-[#71878c]">These flags describe the FMU; Gateway support and reservation policy determine which features are available here.</p>
          </div>
        ) : null}
      </div>
    </details>
  )
}

FmiModelStructurePanel.propTypes = {
  metadata: PropTypes.object,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
}
