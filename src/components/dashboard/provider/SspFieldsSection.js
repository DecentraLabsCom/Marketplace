import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Loader2, PackageSearch } from 'lucide-react'
import SspTopology from '@/components/ssp/SspTopology'
import devLog from '@/utils/dev/logger'

export default function SspFieldsSection({
  localLab,
  applySspMetadata,
  errors,
  disabled,
  gatewayUrl,
  uploadPackage,
}) {
  const [analysis, setAnalysis] = useState({ loading: false, error: null, fetched: false })
  const abortRef = useRef(null)

  const handlePackageChange = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.ssp') && !lowerName.endsWith('.zip')) {
      setAnalysis({ loading: false, error: 'Package must be a .ssp or .zip file', fetched: false })
      return
    }
    if (!gatewayUrl) {
      setAnalysis({ loading: false, error: 'Set Gateway URL first', fetched: false })
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAnalysis({ loading: true, error: null, fetched: false })

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('gatewayUrl', gatewayUrl)

      const response = await fetch('/api/ssp/metadata', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || `Gateway returned ${response.status}`)
      }
      if (!data.valid) {
        throw new Error(Array.isArray(data.errors) && data.errors.length > 0
          ? data.errors.join('; ')
          : 'SSP package validation failed')
      }

      let packageUrl = localLab?.sspPackageUrl || ''
      if (uploadPackage) {
        const uploadResult = await uploadPackage(file)
        packageUrl = uploadResult?.filePath || packageUrl
      }

      applySspMetadata({
        sspPackageFileName: file.name,
        sspPackageUrl: packageUrl,
        sspMetadata: data.metadata,
        accessKey: file.name,
        maxConcurrentUsers: localLab?.maxConcurrentUsers || 1,
      })
      setAnalysis({ loading: false, error: null, fetched: true })
    } catch (error) {
      if (error.name === 'AbortError') return
      devLog.error('SSP package analysis failed:', error)
      setAnalysis({ loading: false, error: error.message, fetched: false })
    }
  }, [applySspMetadata, gatewayUrl, localLab?.maxConcurrentUsers, localLab?.sspPackageUrl, uploadPackage])

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const metadata = localLab?.sspMetadata
  const components = Array.isArray(metadata?.components) ? metadata.components : []
  const connections = Array.isArray(metadata?.connections) ? metadata.connections : []
  const variants = Array.isArray(metadata?.variants) ? metadata.variants : []

  return (
    <section className="space-y-4 border-l-4 border-[#75a887] pl-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <PackageSearch className="w-5 h-5 text-[#75a887]" />
        SSP Package
      </h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Package File <span className="text-gray-400">(.ssp or .zip)</span>
        </label>
        <input
          type="file"
          accept=".ssp,.zip,application/zip"
          onChange={handlePackageChange}
          disabled={disabled || analysis.loading}
          className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400"
        />
        {!gatewayUrl && !analysis.error && (
          <p className="text-gray-400 text-sm mt-1">Set Access URI above to validate SSP packages</p>
        )}
        {errors.sspPackageFileName && <p className="text-red-500 text-sm mt-1!">{errors.sspPackageFileName}</p>}
        {analysis.loading && (
          <p className="flex items-center text-sm text-blue-600 mt-1">
            <Loader2 className="size-4 mr-1 animate-spin" />
            Validating package...
          </p>
        )}
        {analysis.error && (
          <p className="text-red-500 text-sm mt-1!">Validation failed: {analysis.error}</p>
        )}
        {analysis.fetched && (
          <p className="text-green-600 text-sm mt-1!">SSP metadata loaded successfully</p>
        )}
      </div>

      {localLab?.sspPackageFileName && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded border border-gray-200 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Package</div>
            <div className="truncate text-sm font-semibold text-gray-900" title={localLab.sspPackageFileName}>
              {localLab.sspPackageFileName}
            </div>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Components</div>
            <div className="text-sm font-semibold text-gray-900">{components.length}</div>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Connections</div>
            <div className="text-sm font-semibold text-gray-900">{connections.length}</div>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Variants</div>
            <div className="text-sm font-semibold text-gray-900">{variants.length}</div>
          </div>
        </div>
      )}

      {metadata && (
        <div className="rounded bg-[#111416] p-3">
          <SspTopology metadata={metadata} compact />
        </div>
      )}
    </section>
  )
}

SspFieldsSection.propTypes = {
  localLab: PropTypes.object,
  applySspMetadata: PropTypes.func.isRequired,
  errors: PropTypes.object,
  disabled: PropTypes.bool,
  gatewayUrl: PropTypes.string,
  uploadPackage: PropTypes.func,
}
