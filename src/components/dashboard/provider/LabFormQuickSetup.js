import PropTypes from 'prop-types'
import { useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { RESOURCE_TYPES } from '@/utils/resourceType'
import devLog from '@/utils/dev/logger'

function resolveGatewayAuthEndpoint(gatewayUrl) {
  try {
    const url = new URL(gatewayUrl)
    return `${url.origin}/auth/login`
  } catch {
    return null
  }
}

/**
 * Quick lab setup form for simplified lab creation with minimal required fields
 * Provides streamlined interface for providers to quickly publish labs
 * @param {Object} props
 * @param {Object} props.localLab - Local lab state object with basic fields
 * @param {Function} props.setLocalLab - Function to update local lab state
 * @param {Object} props.errors - Validation errors object
 * @param {boolean} props.isLocalURI - Whether using local URI (disables editing)
 * @param {React.RefObject} props.priceRef - Ref for price input field
 * @param {React.RefObject} props.accessURIRef - Ref for access URI input field
 * @param {React.RefObject} props.accessKeyRef - Ref for access key input field
 * @param {React.RefObject} props.uriRef - Ref for URI input field
 * @param {boolean} props.clickedToEditUri - Whether URI edit mode is active
 * @param {Function} props.setClickedToEditUri - Function to toggle URI edit mode
 * @param {Function} props.handleUriChange - Handler for URI changes
 * @param {Function} props.onSubmit - Form submission handler
 * @param {Function} props.onCancel - Form cancellation handler
 * @param {Object} props.lab - Original lab object for reference
 * @param {Function} [props.onSwitchToFullSetup] - Callback to switch to Full Setup when FMU mode is active
 * @returns {JSX.Element} Quick setup form with essential lab fields
 */
export default function LabFormQuickSetup({ localLab, setLocalLab, errors, isLocalURI, priceRef,
  accessURIRef, accessKeyRef, uriRef, clickedToEditUri, setClickedToEditUri, handleUriChange,
  onSubmit, onCancel, lab, onSwitchToFullSetup }) {

  const isFmu = localLab?.resourceType === RESOURCE_TYPES.FMU

  const [describeFetch, setDescribeFetch] = useState({ loading: false, error: null, fetched: false })
  const abortRef = useRef(null)

  const fetchDescribe = useCallback(async () => {
    const fmuFileName = localLab?.fmuFileName?.trim()
    if (!fmuFileName) return
    const gatewayUrl = localLab?.accessURI?.trim()
    if (!gatewayUrl) {
      setDescribeFetch({ loading: false, error: 'Set Gateway URL first', fetched: false })
      return
    }
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setDescribeFetch({ loading: true, error: null, fetched: false })
    try {
      const gwParam = encodeURIComponent(gatewayUrl)
      const authEndpoint = resolveGatewayAuthEndpoint(gatewayUrl)
      let describeAuthHeader = {}
      if (authEndpoint) {
        try {
          const authRes = await fetch('/api/auth/lab-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ authEndpoint, includeBookingInfo: false }),
          })
          if (authRes.ok) {
            const authData = await authRes.json()
            if (authData?.token) describeAuthHeader = { Authorization: `Bearer ${authData.token}` }
          }
        } catch (authError) {
          devLog.warn('FMU describe auth failed, continuing without token', authError)
        }
      }
      const labParam = localLab?.id ? `&labId=${encodeURIComponent(String(localLab.id))}` : ''
      const res = await fetch(
        `/api/simulations/describe?fmuFileName=${encodeURIComponent(fmuFileName)}&gatewayUrl=${gwParam}${labParam}`,
        { signal: controller.signal, headers: describeAuthHeader }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Gateway returned ${res.status}`)
      }
      const data = await res.json()
      setLocalLab({
        ...localLab,
        fmuFileName,
        accessKey: fmuFileName,
        fmiVersion: data.fmiVersion || '',
        simulationType: data.simulationType || '',
        modelVariables: Array.isArray(data.modelVariables) ? data.modelVariables : [],
        ...(data.defaultStartTime != null && { defaultStartTime: data.defaultStartTime }),
        ...(data.defaultStopTime != null && { defaultStopTime: data.defaultStopTime }),
        ...(data.defaultStepSize != null && { defaultStepSize: data.defaultStepSize }),
      })
      setDescribeFetch({ loading: false, error: null, fetched: true })
    } catch (err) {
      if (err.name === 'AbortError') return
      devLog.error('FMU Quick describe failed:', err)
      setDescribeFetch({ loading: false, error: err.message, fetched: false })
    }
  }, [localLab, setLocalLab])

  return (
    <form className="space-y-4 text-gray-600" onSubmit={onSubmit}>
      {errors.resourceType && <p className="text-red-500 text-sm !mt-1">{errors.resourceType}</p>}

      <input
        type="number"
        step="any"
        min="0"
        placeholder="Price per hour"
        value={localLab?.price || ''}
        onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isLocalURI}
        ref={priceRef}
      />
      {errors.price && <p className="text-red-500 text-sm mt-1!">{errors.price}</p>}

      <input
        type="text"
        placeholder="Access URI"
        value={localLab?.accessURI || ''}
        onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isLocalURI}
        ref={accessURIRef}
      />
      {errors.accessURI && <p className="text-red-500 text-sm mt-1!">{errors.accessURI}</p>}

      {isFmu ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="FMU file name (e.g. spring-damper.fmu)"
              value={localLab?.fmuFileName || ''}
              onChange={(e) => setLocalLab({ ...localLab, fmuFileName: e.target.value, accessKey: e.target.value })}
              className="flex-1 p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400
              disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={isLocalURI}
            />
            <button
              type="button"
              onClick={fetchDescribe}
              disabled={isLocalURI || describeFetch.loading || !localLab?.fmuFileName?.trim() || !localLab?.accessURI?.trim()}
              className="px-3 py-2 rounded bg-[#7875a8] text-white hover:bg-[#625f8f] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1 text-sm whitespace-nowrap"
            >
              {describeFetch.loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {describeFetch.loading ? 'Loading…' : 'Auto-detect'}
            </button>
          </div>
          {errors.fmuFileName && <p className="text-red-500 text-sm mt-1!">{errors.fmuFileName}</p>}
          {describeFetch.error && (
            <p className="text-amber-600 text-sm">Auto-detect failed: {describeFetch.error}</p>
          )}
          {describeFetch.fetched && (
            <p className="text-green-600 text-sm">✓ FMU metadata loaded successfully</p>
          )}
          <p className="text-xs text-gray-400">
            Access Key is set automatically to match the FMU file name.
            {onSwitchToFullSetup && (
              <> For advanced configuration,{' '}
                <button type="button" onClick={onSwitchToFullSetup} className="underline text-[#7875a8] hover:text-[#625f8f]">
                  switch to Full Setup
                </button>.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Access Key"
            value={localLab?.accessKey || ''}
            onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
            disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={isLocalURI}
            ref={accessKeyRef}
          />
          {errors.accessKey && <p className="text-red-500 text-sm mt-1!">{errors.accessKey}</p>}
        </>
      )}

      <input
        type="text"
        placeholder="Lab Data URL (JSON)"
        value={localLab?.uri || ''}
        onChange={handleUriChange}
        onClick={() => isLocalURI && setClickedToEditUri(true)}
        onBlur={() => isLocalURI && setClickedToEditUri(false)}
        readOnly={isLocalURI && !clickedToEditUri}
        className={`w-full p-2 border rounded ${
          isLocalURI && !clickedToEditUri
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300'
            : ''
        }`}
        ref={uriRef}
      />
      {errors.uri && !(clickedToEditUri && isLocalURI) &&
        <p className="text-red-500 text-sm mt-1!">{errors.uri}</p>
      }
      {isLocalURI && !clickedToEditUri && (
        <div className='mt-4 flex justify-center'>
          <span className="text-sm text-red-500 font-medium">
            While greyed out, you may edit the JSON file field to add it as a link
          </span>
        </div>
      )}
      {clickedToEditUri && isLocalURI && (
        <ol className="text-red-500 text-sm mt-1! list-decimal! ml-5">
          <li>Name changes to the JSON file are not allowed and will be ignored</li>
          <li>
            Introducing a link to a JSON file will replace the data in Full Setup with the information 
            contained in the linked JSON
          </li>
        </ol>
      )}

      <div className="flex justify-between mt-4">
        <button type="submit"
          className="text-white px-4 py-2 rounded bg-[#75a887] hover:bg-[#5c8a68]">
          {lab?.id ? 'Save Changes' : 'Add Lab'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-white px-4 py-2 rounded bg-[#a87583] hover:bg-[#8a5c66]">
          Close
        </button>
      </div>
    </form>
  );
}

LabFormQuickSetup.propTypes = {
  localLab: PropTypes.object.isRequired,
  setLocalLab: PropTypes.func.isRequired,
  errors: PropTypes.object,
  isLocalURI: PropTypes.bool,
  priceRef: PropTypes.object,
  authRef: PropTypes.object,
  accessURIRef: PropTypes.object,
  accessKeyRef: PropTypes.object,
  uriRef: PropTypes.object,
  clickedToEditUri: PropTypes.bool,
  setClickedToEditUri: PropTypes.func,
  handleUriChange: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  lab: PropTypes.object,
  onSwitchToFullSetup: PropTypes.func,
}
