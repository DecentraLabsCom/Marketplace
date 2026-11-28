'use client'

import { useCallback, useRef, useState } from 'react'
import { authenticateLabAccessSSO } from '@/utils/auth/labAuth'
import { useGetIsSSO } from '@/utils/hooks/authMode'
import { establishFmuGatewaySession } from '@/utils/auth/fmuAccess'
import { resolveGatewayOrigin } from '../digital-twin/digitalTwinAssets'

export default function useSimulationGatewaySession({ lab, reservationKey }) {
  const isSSO = useGetIsSSO()
  const [gatewaySessionOrigin, setGatewaySessionOrigin] = useState(null)
  const authPromiseRef = useRef(null)
  const labId = String(lab.id ?? lab.tokenId ?? '')

  const reauthenticateGatewaySession = useCallback(async () => {
    if (authPromiseRef.current) return authPromiseRef.current
    if (!labId) throw new Error('Missing labId')

    const authPromise = (async () => {
      if (!isSSO) throw new Error('Institutional login is required')
      const authData = await authenticateLabAccessSSO({ labId, reservationKey })
      const accessCode = authData?.accessCode
      const labURL = authData?.labURL
      if (!accessCode || !labURL || authData?.resourceType !== 'fmu') {
        throw new Error('Gateway authentication did not return an FMU access code')
      }

      const canonicalReservationKey = authData?.reservationKey || reservationKey
      if (!canonicalReservationKey || (
        reservationKey && String(canonicalReservationKey).toLowerCase() !== String(reservationKey).toLowerCase()
      )) {
        throw new Error('Gateway returned a different FMU reservation context')
      }

      const gatewayOrigin = await establishFmuGatewaySession({
        accessCode,
        labId,
        reservationKey: canonicalReservationKey,
      })
      setGatewaySessionOrigin(gatewayOrigin)
      return gatewayOrigin
    })()

    authPromiseRef.current = authPromise
    try {
      return await authPromise
    } finally {
      authPromiseRef.current = null
    }
  }, [isSSO, labId, reservationKey])

  const ensureGatewaySession = useCallback(async () => {
    if (gatewaySessionOrigin) return gatewaySessionOrigin
    const gatewayOrigin = resolveGatewayOrigin(lab.accessURI)
    if (!gatewayOrigin) throw new Error('Lab gateway URL not available')
    // The FMU handoff normally established this HttpOnly session immediately
    // before navigation. The gateway can verify it, so reuse it optimistically.
    setGatewaySessionOrigin(gatewayOrigin)
    return gatewayOrigin
  }, [gatewaySessionOrigin, lab.accessURI])

  const fetchGateway = useCallback(async (path, init = {}) => {
    await ensureGatewaySession()
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    let response = await fetch(path, init)
    if (response.status !== 401) return response
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

    setGatewaySessionOrigin(null)
    await reauthenticateGatewaySession()
    response = await fetch(path, init)
    return response
  }, [ensureGatewaySession, reauthenticateGatewaySession])

  return { gatewaySessionOrigin, ensureGatewaySession, fetchGateway }
}
