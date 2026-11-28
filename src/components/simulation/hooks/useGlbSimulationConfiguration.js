import { useCallback, useMemo } from 'react'
import { resolveEffectiveSimulationStartTime } from '../utils/simulationTime'

/** Keep GLB Run Controls and execution on the same metadata/experiment/checkpoint time. */
export default function useGlbSimulationConfiguration({
  enabled = true,
  options,
  defaultStartTime,
  experimentStartTime,
  checkpoint,
  loaded = false,
  setLoaded,
  onLoadModelValues,
} = {}) {
  const effectiveStartTime = enabled
    ? resolveEffectiveSimulationStartTime({
      defaultStartTime,
      experimentStartTime,
      checkpointTime: loaded ? checkpoint?.simTime : null,
    })
    : options?.startTime
  const effectiveOptions = useMemo(() => (
    enabled ? { ...options, startTime: effectiveStartTime } : options
  ), [enabled, effectiveStartTime, options])

  const handleLoad = useCallback(() => {
    const shouldLoad = !loaded
    if (shouldLoad) onLoadModelValues?.(checkpoint?.modelValues)
    setLoaded(shouldLoad)
  }, [checkpoint, loaded, onLoadModelValues, setLoaded])

  return { effectiveOptions, handleLoad }
}
