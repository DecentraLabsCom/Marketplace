'use client'

import { useEffect, useState } from 'react'
import devLog from '@/utils/dev/logger'
import { resolveDigitalTwinAsset, resolveGatewayOrigin } from '../digital-twin/digitalTwinAssets'

export default function useDigitalTwinAssetDiscovery({ labId, accessUri }) {
  const [asset, setAsset] = useState(null)
  const [state, setState] = useState('loading')
  const [simulationVariables, setSimulationVariables] = useState(null)

  useEffect(() => {
    if (!labId) {
      setAsset(null)
      setState('ready')
      setSimulationVariables(null)
      return undefined
    }

    const controller = new AbortController()
    setAsset(null)
    setState('loading')
    setSimulationVariables(null)
    fetch(`/api/aas/shell?${new URLSearchParams({ labId })}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null
        return response.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setSimulationVariables(Array.isArray(data?.simulationVariables) ? data.simulationVariables : null)
        const visualAssets = Array.isArray(data?.visualAssets) ? data.visualAssets : []
        // A provider Three.js app is a complete experience and takes precedence
        // over a GLB when both are linked to the same AAS.
        const visualAsset = [
          ...visualAssets.filter((candidate) => candidate?.contentType === 'text/html'),
          ...visualAssets.filter((candidate) => candidate?.contentType === 'model/gltf-binary'),
        ]
          .map((candidate) => resolveDigitalTwinAsset(candidate, resolveGatewayOrigin(accessUri), labId))
          .find(Boolean) || null
        setAsset(visualAsset)
        setState('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        devLog.warn('Digital twin visual asset discovery failed:', error?.message)
        setSimulationVariables(null)
        setAsset(null)
        setState('ready')
      })

    return () => controller.abort()
  }, [accessUri, labId])

  return { asset, state, simulationVariables }
}
