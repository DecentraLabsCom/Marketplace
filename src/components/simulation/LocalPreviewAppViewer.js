'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { filterModelVariablesByAccess, getInitializationEditableVariables, getRuntimeWritableVariables } from './simulationVariableAccess'
import { filterFmiLsExperimentsForVariables, filterFmiLsParameterPresets } from '@/utils/fmiLsEligibility'

const DigitalTwinAppViewer = dynamic(() => import('./DigitalTwinAppViewer'), { ssr: false })
const APP_REFERENCE_RE = /^\/digital-twin-apps\/(local_demo_[a-f0-9]{24})\/([a-f0-9]{64})\/index\.html$/i

export default function LocalPreviewAppViewer({ demo, model, ...viewerProps }) {
  const [appUrl, setAppUrl] = useState('')
  const [access, setAccess] = useState(null)
  const [localInputEvents, setLocalInputEvents] = useState([])
  const [state, setState] = useState('loading')
  const accessibleModelVariables = useMemo(
    () => filterModelVariablesByAccess(access?.modelVariables || [], access),
    [access],
  )
  const editableVariables = useMemo(
    () => getInitializationEditableVariables(accessibleModelVariables, access),
    [accessibleModelVariables, access],
  )
  const fmiLsParameterPresets = useMemo(
    () => filterFmiLsParameterPresets(access?.fmiLsParameterPresets, editableVariables),
    [access?.fmiLsParameterPresets, editableVariables],
  )
  const fmiLsExperiments = useMemo(
    () => filterFmiLsExperimentsForVariables(access?.fmiLsExperiments, editableVariables),
    [access?.fmiLsExperiments, editableVariables],
  )
  const runtimeVariables = useMemo(
    () => getRuntimeWritableVariables(accessibleModelVariables, access),
    [accessibleModelVariables, access],
  )
  const inputEvents = viewerProps.inputEvents ?? localInputEvents
  const onInputEventsChange = viewerProps.onInputEventsChange ?? setLocalInputEvents
  const supportsInputSchedule = access?.simulationType === 'CoSimulation'

  useEffect(() => {
    const controller = new AbortController()
    setAppUrl('')
    setAccess(null)
    setLocalInputEvents([])
    setState('loading')

    fetch('/api/dev/fmu-access', {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo, ...(typeof model === 'string' ? { model } : {}) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('The local AASX could not be loaded.')
        return response.json()
      })
      .then((access) => {
        if (controller.signal.aborted) return
        const asset = (Array.isArray(access?.visualAssets) ? access.visualAssets : [])
          .find((candidate) => candidate?.contentType === 'text/html'
            && candidate?.renderer === 'threejs-app'
            && typeof candidate?.url === 'string'
            && APP_REFERENCE_RE.test(candidate.url))
        const match = typeof asset?.url === 'string' ? asset.url.match(APP_REFERENCE_RE) : null
        if (!match || access?.labId !== match[1]) {
          throw new Error('The local AASX does not reference a Three.js application for this FMU.')
        }
        setAccess(access)
        setAppUrl(`/api/dev/digital-twin-app/${match[1]}/${match[2].toLowerCase()}/index.html`)
        setState('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState(error?.message || 'The local Three.js application could not be loaded.')
      })

    return () => controller.abort()
  }, [demo, model])

  if (state === 'loading') {
    return <main className="grid min-h-screen place-items-center bg-[#061116] px-6 text-sm text-[#b9d5d4]" role="status">Loading the application referenced by the local AASX…</main>
  }
  if (state !== 'ready') {
    return <main className="grid min-h-screen place-items-center bg-[#061116] px-6 text-center text-sm text-rose-200" role="alert">{state}</main>
  }

  return (
    <DigitalTwinAppViewer
      {...viewerProps}
      appUrl={appUrl}
      fmiLsParameterPresets={fmiLsParameterPresets}
      fmiLsExperiments={fmiLsExperiments}
      modelVariables={viewerProps.modelVariables ?? accessibleModelVariables}
      fmiLsStruct={viewerProps.fmiLsStruct ?? access?.fmiLsStruct}
      scheduleVariables={viewerProps.scheduleVariables ?? runtimeVariables}
      enableInputSchedule={viewerProps.enableInputSchedule ?? supportsInputSchedule}
      inputEvents={inputEvents}
      onInputEventsChange={onInputEventsChange}
      startTime={viewerProps.startTime ?? access?.defaultStartTime ?? 0}
      stopTime={viewerProps.stopTime ?? access?.defaultStopTime ?? 1}
      stepSize={viewerProps.stepSize ?? access?.defaultStepSize}
    />
  )
}
