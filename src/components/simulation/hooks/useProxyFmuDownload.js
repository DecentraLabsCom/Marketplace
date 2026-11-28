import { useCallback, useEffect, useRef, useState } from 'react'
import devLog from '@/utils/dev/logger'

function resolveProxyError(status, payload) {
  const detailsRaw = payload?.details
  let gatewayDetail = null
  if (typeof detailsRaw === 'string') {
    try {
      gatewayDetail = JSON.parse(detailsRaw)
    } catch {
      gatewayDetail = { error: detailsRaw }
    }
  } else if (typeof detailsRaw === 'object' && detailsRaw !== null) {
    gatewayDetail = detailsRaw
  }

  const gatewayCode = String(gatewayDetail?.code || '').toUpperCase()
  if (gatewayCode === 'SESSION_TICKET_EXPIRED' || gatewayCode === 'SESSION_TICKET_ALREADY_USED') {
    return 'The reservation FMU could not be prepared. Re-enter the reserved laboratory to request a fresh file.'
  }
  if (status === 401) {
    return 'The reservation FMU could not be authorized. Re-enter the reserved laboratory and try again.'
  }
  return payload?.error || gatewayDetail?.error || `Proxy download failed (${status})`
}

export default function useProxyFmuDownload({
  fetchGateway,
  lab,
  reservationKey,
  hasFmuMetadata,
  twinAsset,
  twinAssetState,
}) {
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState(null)
  const attemptRef = useRef(null)
  const labId = String(lab?.id ?? lab?.tokenId ?? '')
  const attemptKey = reservationKey && hasFmuMetadata
    ? `${labId}:${String(reservationKey).toLowerCase()}`
    : ''

  const triggerDownload = useCallback(async () => {
    if (!reservationKey) return
    setState('running')
    setMessage(null)

    try {
      const query = new URLSearchParams({ labId, reservationKey: String(reservationKey) })
      const response = await fetchGateway(`/api/simulations/proxy?${query.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        let payload = {}
        try {
          payload = await response.json()
        } catch {
          payload = {}
        }
        throw new Error(resolveProxyError(response.status, payload))
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const filenameMatch = /filename="?([^"]+)"?/i.exec(contentDisposition)
      const filename = filenameMatch?.[1] || `fmu-proxy-lab-${lab?.id ?? lab?.tokenId}.fmu`
      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename
      anchor.hidden = true
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

      setState('success')
      setMessage('Reservation FMU downloaded automatically.')
    } catch (error) {
      devLog.error('Proxy FMU download failed:', error)
      setState('error')
      setMessage(error?.message || 'Unable to download proxy FMU')
    }
  }, [fetchGateway, lab?.id, lab?.tokenId, labId, reservationKey])

  useEffect(() => {
    if (twinAssetState !== 'ready' || twinAsset?.type === 'threejs-app' || !attemptKey || attemptRef.current === attemptKey) return
    attemptRef.current = attemptKey
    void triggerDownload()
  }, [attemptKey, triggerDownload, twinAsset, twinAssetState])

  return { state, message, triggerDownload }
}
