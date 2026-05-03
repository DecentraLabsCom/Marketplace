import { useState, useRef, useCallback, useEffect } from 'react'
import { Loader2, Cpu } from 'lucide-react'
import { normalizeArray } from './labFormUtils'
import devLog from '@/utils/dev/logger'

export default function FmuFieldsSection({ localLab, handleBasicChange, applyFmuMetadata, errors, disabled, gatewayUrl }) {
  const [describeFetch, setDescribeFetch] = useState({ loading: false, error: null, fetched: false })
  const abortRef = useRef(null)

  const fetchDescribe = useCallback(async () => {
    const fmuFileName = localLab?.fmuFileName?.trim()
    if (!fmuFileName) return
    if (!gatewayUrl) {
      setDescribeFetch({ loading: false, error: 'Gateway URL not available (set Access URI first)', fetched: false })
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setDescribeFetch({ loading: true, error: null, fetched: false })

    try {
      const gwParam = encodeURIComponent(gatewayUrl)

      // Obtain a short-lived describe token from blockchain-services via the
      // Marketplace proxy. This avoids re-validating the (potentially expired)
      // SAML assertion and issues a JWT with the required accessKey claim.
      let describeAuthHeader = {}
      try {
        const tokenRes = await fetch(
          `/api/fmu/provider-describe-token?fmuFileName=${encodeURIComponent(fmuFileName)}&gatewayUrl=${gwParam}`,
          { credentials: 'include', signal: controller.signal },
        )
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json()
          if (tokenData?.token) {
            describeAuthHeader = { Authorization: `Bearer ${tokenData.token}` }
          }
        } else {
          devLog.warn('FMU provider describe token request failed:', tokenRes.status)
        }
      } catch (tokenError) {
        if (tokenError.name === 'AbortError') throw tokenError
        devLog.warn('FMU provider describe token request failed, continuing without bearer token', tokenError)
      }

      const labParam = localLab?.id ? `&labId=${encodeURIComponent(String(localLab.id))}` : ''
      const res = await fetch(`/api/simulations/describe?fmuFileName=${encodeURIComponent(fmuFileName)}&gatewayUrl=${gwParam}${labParam}`, {
        signal: controller.signal,
        headers: describeAuthHeader,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Gateway returned ${res.status}`)
      }
      const data = await res.json()
      // Apply all metadata fields in a single update to avoid stale-closure overwrites
      const applyMetadata = applyFmuMetadata || handleBasicChange
      if (applyFmuMetadata) {
        applyFmuMetadata({
          fmiVersion: data.fmiVersion || '',
          simulationType: data.simulationType || '',
          modelVariables: Array.isArray(data.modelVariables) ? data.modelVariables : [],
          ...(data.defaultStartTime != null ? { defaultStartTime: data.defaultStartTime } : {}),
          ...(data.defaultStopTime != null ? { defaultStopTime: data.defaultStopTime } : {}),
          ...(data.defaultStepSize != null ? { defaultStepSize: data.defaultStepSize } : {}),
        })
      } else {
        handleBasicChange('fmiVersion', data.fmiVersion || '')
        handleBasicChange('simulationType', data.simulationType || '')
        handleBasicChange('modelVariables', Array.isArray(data.modelVariables) ? data.modelVariables : [])
        if (data.defaultStartTime != null) handleBasicChange('defaultStartTime', data.defaultStartTime)
        if (data.defaultStopTime != null) handleBasicChange('defaultStopTime', data.defaultStopTime)
        if (data.defaultStepSize != null) handleBasicChange('defaultStepSize', data.defaultStepSize)
      }
      setDescribeFetch({ loading: false, error: null, fetched: true })
    } catch (err) {
      if (err.name === 'AbortError') return
      devLog.error('FMU describe failed:', err)
      setDescribeFetch({ loading: false, error: err.message, fetched: false })
    }
  }, [localLab?.fmuFileName, localLab?.id, handleBasicChange, gatewayUrl])

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [])

  // Clear stale error when gatewayUrl is provided after a failed attempt
  useEffect(() => {
    if (gatewayUrl && describeFetch.error === 'Gateway URL not available (set Access URI first)') {
      setDescribeFetch({ loading: false, error: null, fetched: false })
    }
  }, [gatewayUrl, describeFetch.error])

  const modelVariables = normalizeArray(localLab?.modelVariables)

  return (
    <section className="space-y-4 border-l-4 border-[#7875a8] pl-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Cpu className="w-5 h-5 text-[#7875a8]" />
        FMU Configuration
      </h3>

      {/* Provider-entered: fmuFileName */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          FMU File Name <span className="text-gray-400">(file on Lab Station in production, e.g. spring-damper.fmu)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="spring-damper.fmu"
            value={localLab?.fmuFileName || ''}
            onChange={(e) => handleBasicChange('fmuFileName', e.target.value)}
            className="flex-1 p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={fetchDescribe}
            disabled={disabled || describeFetch.loading || !localLab?.fmuFileName?.trim() || !gatewayUrl}
            className="px-3 py-2 rounded bg-[#7875a8] text-white hover:bg-[#625f8f] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
          >
            {describeFetch.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {describeFetch.loading ? 'Loading…' : 'Auto-detect'}
          </button>
        </div>
        {errors.fmuFileName && <p className="text-red-500 text-sm mt-1!">{errors.fmuFileName}</p>}
        {!gatewayUrl && !describeFetch.error && (
          <p className="text-gray-400 text-sm mt-1">Set Access URI above to enable auto-detect</p>
        )}
        {describeFetch.error && (
          <p className="text-red-500 text-sm mt-1!">Auto-detect failed: {describeFetch.error}</p>
        )}
        {describeFetch.fetched && (
          <p className="text-green-600 text-sm mt-1!">✓ FMU metadata loaded successfully</p>
        )}
      </div>

      {/* Auto-read fields (read-only) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">FMI Version</label>
          <input
            type="text"
            value={localLab?.fmiVersion || ''}
            readOnly
            className="w-full p-2 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
          />
          {errors.fmiVersion && <p className="text-red-500 text-sm mt-1!">{errors.fmiVersion}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Simulation Type</label>
          <input
            type="text"
            value={localLab?.simulationType || ''}
            readOnly
            className="w-full p-2 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
          />
          {errors.simulationType && <p className="text-red-500 text-sm mt-1!">{errors.simulationType}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Default Start Time</label>
          <input
            type="text"
            value={localLab?.defaultStartTime ?? ''}
            readOnly
            className="w-full p-2 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Default Stop Time</label>
          <input
            type="text"
            value={localLab?.defaultStopTime ?? ''}
            readOnly
            className="w-full p-2 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
          />
          {errors.defaultStopTime && <p className="text-red-500 text-sm mt-1!">{errors.defaultStopTime}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Default Step Size</label>
          <input
            type="text"
            value={localLab?.defaultStepSize ?? ''}
            readOnly
            className="w-full p-2 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
          />
          {errors.defaultStepSize && <p className="text-red-500 text-sm mt-1!">{errors.defaultStepSize}</p>}
        </div>
      </div>

      {/* Model Variables table (read-only) */}
      {modelVariables.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Model Variables</label>
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Causality</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Unit</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Start</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelVariables.map((v, i) => (
                  <tr key={`${v.name}-${i}`} className={v.causality === 'input' ? 'bg-blue-50/50' : ''}>
                    <td className="px-3 py-1.5 font-mono">{v.name}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        v.causality === 'input' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {v.causality}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">{v.type}</td>
                    <td className="px-3 py-1.5 text-gray-500">{v.unit || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-500">{v.start ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {errors.modelVariables && <p className="text-red-500 text-sm">{errors.modelVariables}</p>}
    </section>
  )
}
