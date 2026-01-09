import { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { UploadCloud, Link, XCircle, Plus, Trash2, Loader2 } from 'lucide-react'
import { CalendarInput } from '@/components/ui'
import ImagePreviewList from '@/components/ui/media/ImagePreviewList.js'
import DocPreviewList from '@/components/ui/media/DocPreviewList.js'
import CategoryMultiSelect from '../../ui/forms/CategoryMultiSelect'

const WEEKDAY_OPTIONS = [
  { value: 'MONDAY', label: 'Mon' },
  { value: 'TUESDAY', label: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wed' },
  { value: 'THURSDAY', label: 'Thu' },
  { value: 'FRIDAY', label: 'Fri' },
  { value: 'SATURDAY', label: 'Sat' },
  { value: 'SUNDAY', label: 'Sun' }
]

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeObject(value, fallback = {}) {
  return value && typeof value === 'object' ? value : fallback
}

export default function LabFormFullSetup({
  localLab = {},
  setLocalLab,
  errors = {},
  isExternalURI,
  imageInputType,
  setImageInputType,
  imageUrls = [],
  imageLinkRef,
  imageUploadRef,
  handleImageChange = () => {},
  removeImage = () => {},
  localImages = [],
  docInputType,
  setDocInputType,
  docUrls = [],
  docLinkRef,
  docUploadRef,
  handleDocChange = () => {},
  removeDoc = () => {},
  localDocs = [],
  nameRef,
  categoryRef,
  keywordsRef,
  descriptionRef,
  priceRef,
  authRef,
  accessURIRef,
  accessKeyRef,
  timeSlotsRef,
  availableHoursStartRef,
  availableHoursEndRef,
  maxConcurrentUsersRef,
  termsUrlRef,
  termsShaRef,
  showMediaSections = true,
  onSubmit,
  onCancel
}) {
  const availableDays = normalizeArray(localLab.availableDays)
  const availableHours = normalizeObject(localLab.availableHours, { start: '', end: '' })
  const unavailableWindows = normalizeArray(localLab.unavailableWindows)
  const termsOfUse = normalizeObject(localLab.termsOfUse, {
    url: '',
    version: '',
    effectiveDate: '',
    sha256: ''
  })
  const minOpenDate = new Date()
  minOpenDate.setHours(0, 0, 0, 0)

  const disabled = isExternalURI
  const [termsFetchState, setTermsFetchState] = useState({ loading: false, error: null })
  const latestLabRef = useRef(localLab)
  const setLocalLabRef = useRef(setLocalLab)
  const lastFetchedUrlRef = useRef('')
  const termsAbortControllerRef = useRef(null)

  useEffect(() => {
    latestLabRef.current = localLab
  }, [localLab])

  useEffect(() => {
    setLocalLabRef.current = setLocalLab
  }, [setLocalLab])

  const handleBasicChange = (field, value) => {
    setLocalLab({ ...localLab, [field]: value })
  }

  // State for keywords input field (string representation)
  const [keywordsInput, setKeywordsInput] = useState('')

  // Sync keywords input with localLab.keywords on mount and when localLab.keywords changes
  // Only update if the string representation differs to avoid unnecessary re-renders
  useEffect(() => {
    const keywordsString = localLab?.keywords?.join(', ') || ''
    if (keywordsInput !== keywordsString) {
      setKeywordsInput(keywordsString)
    }
  }, [localLab?.keywords]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: keywordsInput is intentionally excluded to prevent infinite loops

  // State for timeSlots input field (string representation)
  const [timeSlotsInput, setTimeSlotsInput] = useState('')

  // Sync timeSlots input with localLab.timeSlots on mount and when localLab.timeSlots changes
  // Only update if the string representation differs to avoid unnecessary re-renders
  useEffect(() => {
    const timeSlotsString = Array.isArray(localLab?.timeSlots) ? localLab.timeSlots.join(', ') : ''
    if (timeSlotsInput !== timeSlotsString) {
      setTimeSlotsInput(timeSlotsString)
    }
  }, [localLab?.timeSlots]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: timeSlotsInput is intentionally excluded to prevent infinite loops

  const handleKeywordsChange = (value) => {
    // Update the input field immediately to allow typing
    setKeywordsInput(value)
  }

  const handleKeywordsBlur = () => {
    // Parse the input into array only when user finishes editing (blur event)
    handleBasicChange('keywords', keywordsInput.split(',').map(keyword => keyword.trim()).filter(Boolean))
  }

  const handleTimeSlotsChange = (value) => {
    // Update the input field immediately to allow typing
    setTimeSlotsInput(value)
  }

  const handleTimeSlotsBlur = () => {
    // Parse the input into array only when user finishes editing (blur event)
    handleBasicChange('timeSlots', timeSlotsInput.split(',').map(slot => slot.trim()).filter(Boolean))
  }

  const handleFormSubmit = (e) => {
    // Process keywords and timeSlots before submitting
    handleKeywordsBlur()
    handleTimeSlotsBlur()
    // Call parent's onSubmit handler
    onSubmit(e)
  }

  const handleArrayField = (field, value) => {
    setLocalLab({ ...localLab, [field]: value })
  }

  const toggleAvailableDay = (dayValue) => {
    if (disabled) return
    const nextDays = availableDays.includes(dayValue)
      ? availableDays.filter(day => day !== dayValue)
      : [...availableDays, dayValue]
    handleArrayField('availableDays', nextDays)
  }

  const handleAvailableHourChange = (key, value) => {
    if (disabled) return
    handleBasicChange('availableHours', { ...availableHours, [key]: value })
  }

  const handleAddWindow = () => {
    if (disabled) return
    const newWindow = { 
      startUnix: null, 
      endUnix: null, 
      reason: '', 
      clientId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` 
    }
    handleArrayField('unavailableWindows', [...unavailableWindows, newWindow])
  }

  const handleWindowChange = (index, updates) => {
    if (disabled) return
    const nextWindows = unavailableWindows.map((window, idx) =>
      idx === index ? { ...window, ...updates } : window
    )
    handleArrayField('unavailableWindows', nextWindows)
  }

  const handleRemoveWindow = (index) => {
    if (disabled) return
    const nextWindows = unavailableWindows.filter((_, idx) => idx !== index)
    handleArrayField('unavailableWindows', nextWindows)
  }

  const handleTermsChange = (field, value) => {
    handleBasicChange('termsOfUse', { ...termsOfUse, [field]: value })
  }

  const convertBufferToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

  const guessVersionFromUrl = (url) => {
    const filename = url.split('/').pop() || ''
    const versionRegex = /v(?:ersion)?[-_]?(\d+(?:\.\d+)*)/i
    const match = filename.match(versionRegex)
    return match ? match[1] : ''
  }

  const termsUrl = termsOfUse.url?.trim() || ''

  useEffect(() => {
    if (!termsUrl) {
      if (termsAbortControllerRef.current) {
        termsAbortControllerRef.current.abort()
        termsAbortControllerRef.current = null
      }
      setTermsFetchState((prev) => (prev.loading ? { loading: false, error: null } : prev))
      lastFetchedUrlRef.current = ''
      return
    }

    if (termsUrl === lastFetchedUrlRef.current) {
      return
    }

    const fetchMetadata = async () => {
      if (termsAbortControllerRef.current) {
        termsAbortControllerRef.current.abort()
      }

      if (!/^https?:\/\//i.test(termsUrl)) {
        setTermsFetchState({ loading: false, error: 'Terms link must be an absolute HTTP(S) URL.' })
        return
      }

      const controller = new AbortController()
      termsAbortControllerRef.current = controller
      setTermsFetchState({ loading: true, error: null })

      try {
        const response = await fetch(termsUrl, { signal: controller.signal })
        if (!response.ok) {
          throw new Error('Unable to download the Terms of Use document.')
        }

        const buffer = await response.arrayBuffer()
        let shaValue = ''
        if (typeof window !== 'undefined' && window.crypto?.subtle?.digest) {
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer)
          shaValue = convertBufferToHex(hashBuffer)
        }

        const versionGuess = guessVersionFromUrl(termsUrl)
        const today = new Date().toISOString().split('T')[0]
        const currentLab = latestLabRef.current || {}
        const currentTerms = currentLab.termsOfUse || {}
        const updates = { url: termsUrl }

        if (!currentTerms.version && versionGuess) {
          updates.version = versionGuess
        }
        if (!currentTerms.effectiveDate) {
          updates.effectiveDate = today
        }
        if (shaValue) {
          updates.sha256 = shaValue
        }

        setLocalLabRef.current({
          ...currentLab,
          termsOfUse: {
            ...currentTerms,
            ...updates
          }
        })

        lastFetchedUrlRef.current = termsUrl
        setTermsFetchState({ loading: false, error: null })
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error('Failed to auto-populate terms metadata:', error)
        setTermsFetchState({
          loading: false,
          error: 'Unable to auto-fill version/date/hash for this link.'
        })
        lastFetchedUrlRef.current = ''
      } finally {
        if (termsAbortControllerRef.current === controller) {
          termsAbortControllerRef.current = null
        }
      }
    }

    fetchMetadata()
  }, [termsUrl])

  useEffect(() => {
    return () => {
      if (termsAbortControllerRef.current) {
        termsAbortControllerRef.current.abort()
        termsAbortControllerRef.current = null
      }
    }
  }, [])

  const handleTimeFieldClick = useCallback((event) => {
    if (typeof event.currentTarget.showPicker === 'function') {
      try {
        event.currentTarget.showPicker()
      } catch (error) {
        // Ignore browsers that restrict programmatic access without gesture
      }
    }
  }, [])


  return (
    <form className="space-y-6 text-gray-600" onSubmit={handleFormSubmit}>
      {isExternalURI && (
        <div className="mt-4 flex justify-center">
          <span className="text-sm text-red-500 font-medium">
            To edit these fields, first remove the link to the JSON file in Quick Setup
          </span>
        </div>
      )}

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
        <input
          type="text"
          placeholder="Lab Name"
          value={localLab?.name || ''}
          onChange={(e) => handleBasicChange('name', e.target.value)}
          className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
          disabled={disabled}
          ref={nameRef}
        />
        {errors.name && <p className="text-red-500 text-sm !mt-1">{errors.name}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Categories</label>
          <CategoryMultiSelect
            value={Array.isArray(localLab?.category) ? localLab.category : (localLab?.category ? [localLab.category] : [])}
            onChange={(categories) => handleBasicChange('category', categories)}
            disabled={disabled}
            placeholder="Select one or more categories..."
            error={errors.category}
          />
        </div>

        <div>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Price per hour"
            value={localLab?.price || ''}
            onChange={(e) => handleBasicChange('price', e.target.value)}
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={disabled}
            ref={priceRef}
          />
          {errors.price && <p className="text-red-500 text-sm !mt-1">{errors.price}</p>}
        </div>

        <input
          type="text"
          placeholder="Keywords (comma-separated)"
          value={keywordsInput}
          onChange={(e) => handleKeywordsChange(e.target.value)}
          onBlur={handleKeywordsBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
          disabled={disabled}
          ref={keywordsRef}
        />
        {errors.keywords && <p className="text-red-500 text-sm !mt-1">{errors.keywords}</p>}

        <textarea
          placeholder="Description"
          value={localLab?.description || ''}
          onChange={(e) => handleBasicChange('description', e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation(); }}
          className="w-full p-2 border rounded min-h-32 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
          disabled={disabled}
          ref={descriptionRef}
        />
        {errors.description && <p className="text-red-500 text-sm !mt-1">{errors.description}</p>}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Access Details</h3>
        <div>
          <input
            type="text"
            placeholder="Access URI"
            value={localLab?.accessURI || ''}
            onChange={(e) => handleBasicChange('accessURI', e.target.value)}
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={disabled}
            ref={accessURIRef}
          />
          {errors.accessURI && <p className="text-red-500 text-sm !mt-1">{errors.accessURI}</p>}
        </div>
        <div>
          <input
            type="text"
            placeholder="Access Key"
            value={localLab?.accessKey || ''}
            onChange={(e) => handleBasicChange('accessKey', e.target.value)}
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={disabled}
            ref={accessKeyRef}
          />
          {errors.accessKey && <p className="text-red-500 text-sm !mt-1">{errors.accessKey}</p>}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Availability & Scheduling</h3>
        <div className="flex flex-col md:flex-row md:gap-6">
          <div className="w-full md:flex-1">
            <CalendarInput
              label="Opens"
              value={localLab?.opens ?? null}
              onChange={(value) => handleBasicChange('opens', value)}
              disabled={disabled}
              minDate={minOpenDate}
              containerClassName="w-full"
              labelClassName="md:text-left"
            />
            {errors.opens && <p className="text-red-500 text-sm !mt-1">{errors.opens}</p>}
          </div>
          <div className="w-full md:flex-1">
            <CalendarInput
              label="Closes"
              value={localLab?.closes ?? null}
              onChange={(value) => handleBasicChange('closes', value)}
              disabled={disabled}
              containerClassName="w-full"
            />
            {errors.closes && <p className="text-red-500 text-sm !mt-1">{errors.closes}</p>}
          </div>
        </div>

        <label className="text-sm font-medium text-gray-900">Available Days</label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_OPTIONS.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              onClick={() => toggleAvailableDay(value)}
              className={`px-3 py-1 rounded-full border transition ${
                availableDays.includes(value)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
        {errors.availableDays && <p className="text-red-500 text-sm !mt-1">{errors.availableDays}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Daily Start Time</label>
            <input
              type="time"
              value={availableHours.start || ''}
              onChange={(e) => handleAvailableHourChange('start', e.target.value)}
              className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={disabled}
              onClick={handleTimeFieldClick}
              ref={availableHoursStartRef}
            />
            {errors.availableHoursStart && (
              <p className="text-red-500 text-sm !mt-1">{errors.availableHoursStart}</p>
            )}
          </div>
          <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Daily End Time</label>
            <input
              type="time"
              value={availableHours.end || ''}
              onChange={(e) => handleAvailableHourChange('end', e.target.value)}
              className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={disabled}
              onClick={handleTimeFieldClick}
              ref={availableHoursEndRef}
            />
            {errors.availableHoursEnd && (
              <p className="text-red-500 text-sm !mt-1">{errors.availableHoursEnd}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Time Slots (minutes)</label>
            <input
              type="text"
              placeholder="15, 30, 60"
              value={timeSlotsInput}
              onChange={(e) => handleTimeSlotsChange(e.target.value)}
              onBlur={handleTimeSlotsBlur}
              className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={disabled}
              ref={timeSlotsRef}
            />
            {errors.timeSlots && <p className="text-red-500 text-sm !mt-1">{errors.timeSlots}</p>}
          </div>
          <div className="hidden">
            <label className="block text-sm font-medium text-gray-900 mb-1">Max Concurrent Users</label>
            <input
              type="number"
              min="1"
              placeholder="Max Concurrent Users"
              value={localLab?.maxConcurrentUsers || ''}
              onChange={(e) => handleBasicChange('maxConcurrentUsers', e.target.value)}
              className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={true}
              ref={maxConcurrentUsersRef}
            />
            {errors.maxConcurrentUsers && (
              <p className="text-red-500 text-sm !mt-1">{errors.maxConcurrentUsers}</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Unavailable Windows</h3>
          <button
            type="button"
            onClick={handleAddWindow}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
            disabled={disabled}
          >
            <Plus className="size-4 mr-1" />
            Add window
          </button>
        </div>

        <div className="space-y-4">
          {unavailableWindows.map((window, index) => (
            <div key={window.clientId || `${window.startUnix}-${index}`} className="border rounded-md p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:gap-6">
                <div className="w-full md:flex-1">
                  <CalendarInput
                    label="Starts"
                    value={window.startUnix}
                    onChange={(value) => handleWindowChange(index, { startUnix: value })}
                    withTime
                    disabled={disabled}
                    popperClassName="availability-picker"
                    popperPlacement="bottom-start"
                    popperModifiers={[
                      { name: 'offset', options: { offset: [12, 10] } }
                    ]}
                    containerClassName="w-full"
                  />
                </div>
                <div className="w-full md:flex-1">
                  <CalendarInput
                    label="Ends"
                    value={window.endUnix}
                    onChange={(value) => handleWindowChange(index, { endUnix: value })}
                    withTime
                    disabled={disabled}
                    popperClassName="availability-picker"
                    popperPlacement="bottom-end"
                    popperModifiers={[
                      { name: 'offset', options: { offset: [-16, 10] } }
                    ]}
                    containerClassName="w-full"
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Reason (e.g., Maintenance, Calibration)"
                value={window.reason || ''}
                onChange={(e) => handleWindowChange(index, { reason: e.target.value })}
                className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
                disabled={disabled}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleRemoveWindow(index)}
                  className="text-sm text-red-600 flex items-center hover:text-red-700 disabled:opacity-50"
                  disabled={disabled}
                >
                  <Trash2 className="size-4 mr-1" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {errors.unavailableWindows && (
          <p className="text-red-500 text-sm !mt-1">{errors.unavailableWindows}</p>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Terms of Use</h3>
        <div>
          <input
            type="url"
            placeholder="Terms URL (optional)"
            value={termsOfUse.url || ''}
            onChange={(e) => handleTermsChange('url', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={disabled}
            ref={termsUrlRef}
          />
          {termsFetchState.loading && (
            <p className="flex items-center text-sm text-blue-600 mt-1">
              <Loader2 className="size-4 mr-1 animate-spin" />
              Fetching metadata…
            </p>
          )}
          {termsFetchState.error && (
            <p className="text-sm text-red-500 mt-1">{termsFetchState.error}</p>
          )}
          {errors.termsOfUseUrl && (
            <p className="text-red-500 text-sm !mt-1">{errors.termsOfUseUrl}</p>
          )}
        </div>
        <input
          type="hidden"
          value={termsOfUse.version || ''}
          readOnly
        />
        <input
          type="hidden"
          value={termsOfUse.effectiveDate || ''}
          readOnly
        />
        <input
          type="hidden"
          value={termsOfUse.sha256 || ''}
          readOnly
          ref={termsShaRef}
        />
        {errors.termsOfUseEffectiveDate && (
          <p className="text-red-500 text-sm !mt-1">{errors.termsOfUseEffectiveDate}</p>
        )}
        {errors.termsOfUseSha && (
          <p className="text-red-500 text-sm !mt-1">{errors.termsOfUseSha}</p>
        )}
      </section>

      {showMediaSections && (
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Media</h3>
        <div className="space-y-2">
          <h4 className="font-semibold">Images</h4>
          <div className="flex">
            <button
              type="button"
              className={`px-4 py-2 rounded mr-2 ${imageInputType === 'link'
                ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
              onClick={() => setImageInputType('link')}
              disabled={disabled}
            >
              <div className="flex items-center justify-center">
                <Link className="mr-2 ml-[-2px] w-4" />
                <span>Link</span>
              </div>
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded ${imageInputType === 'upload'
                ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
              onClick={() => setImageInputType('upload')}
              disabled={disabled}
            >
              <div className="flex items-center justify-center">
                <UploadCloud className="mr-2 ml-[-2px] w-4" />
                <span>Upload</span>
              </div>
            </button>
          </div>
          {imageInputType === 'link' && (
            <input
              type="text"
              placeholder="Images URLs (comma-separated)"
              value={Array.isArray(localLab?.images) ? localLab.images.join(', ') : ''}
              onChange={(e) => handleBasicChange('images', e.target.value.split(',').map(img => img.trim()).filter(Boolean))}
              className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={disabled}
              ref={imageLinkRef}
            />
          )}
          {errors.images && <p className="text-red-500 text-sm mt-1">{errors.images}</p>}
          {imageInputType === 'upload' && (
            <>
              <input
                type="file"
                multiple
                onChange={handleImageChange}
                className="w-full"
                disabled={disabled}
                ref={imageUploadRef}
                style={{ display: 'none' }}
                accept="image/*"
              />
              <button
                type="button"
                onClick={() => imageUploadRef.current?.click()}
                className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
                disabled={disabled}
              >
                <div className="flex items-center justify-center">
                  <UploadCloud className="mr-2 size-4" />
                  <span>Choose Files</span>
                </div>
              </button>
              {localImages.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-gray-500">Selected Files:</p>
                  <ul className="list-disc list-inside">
                    {localImages.map((file, index) => (
                      <li key={index} className="text-sm flex items-center justify-between">
                        <span>{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <XCircle className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {imageUrls.length > 0 && (
                <ImagePreviewList imageUrls={imageUrls} removeImage={removeImage} isExternalURI={isExternalURI} />
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold">Documents</h4>
          <div className="flex">
            <button
              type="button"
              className={`px-4 py-2 rounded mr-2 ${docInputType === 'link'
                ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
              onClick={() => setDocInputType('link')}
              disabled={disabled}
            >
              <div className="flex items-center justify-center">
                <Link className="mr-2 ml-[-2px] w-4" />
                <span>Link</span>
              </div>
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded ${docInputType === 'upload'
                ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
              onClick={() => setDocInputType('upload')}
              disabled={disabled}
            >
              <div className="flex items-center justify-center">
                <UploadCloud className="mr-2 ml-[-2px] w-4" />
                <span>Upload</span>
              </div>
            </button>
          </div>
          {docInputType === 'link' && (
            <input
              type="text"
              placeholder="Docs URLs (comma-separated)"
              value={Array.isArray(localLab?.docs) ? localLab.docs.join(', ') : ''}
              onChange={(e) => handleBasicChange('docs', e.target.value.split(',').map(doc => doc.trim()).filter(Boolean))}
              className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
              disabled={disabled}
              ref={docLinkRef}
            />
          )}
          {errors.docs && <p className="text-red-500 text-sm mt-1">{errors.docs}</p>}
          {docInputType === 'upload' && (
            <>
              <input
                type="file"
                multiple
                onChange={handleDocChange}
                className="w-full"
                ref={docUploadRef}
                style={{ display: 'none' }}
                accept="application/pdf"
              />
              <button
                type="button"
                onClick={() => docUploadRef.current?.click()}
                className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300"
                disabled={disabled}
              >
                <div className="flex items-center justify-center">
                  <UploadCloud className="mr-2 size-4" />
                  <span>Choose Files</span>
                </div>
              </button>
              {localDocs.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-gray-500">Selected Files:</p>
                  <ul className="list-disc list-inside">
                    {localDocs.map((file, index) => (
                      <li key={index} className="text-sm flex items-center justify-between">
                        <span>{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeDoc(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <XCircle className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {docUrls.length > 0 && (
                <DocPreviewList docUrls={docUrls} removeDoc={removeDoc} isExternalURI={isExternalURI} />
              )}
            </>
          )}
        </div>
      </section>
      )}

      <div className="flex justify-between pt-4">
        <button
          type="submit"
          disabled={disabled}
          className="text-white px-4 py-2 rounded bg-[#75a887] hover:bg-[#5c8a68] disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-300"
        >
          {localLab?.id ? 'Save Changes' : 'Add Lab'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-white px-4 py-2 rounded bg-[#a87583] hover:bg-[#8a5c66]"
        >
          Close
        </button>
      </div>
    </form>
  )
}

LabFormFullSetup.propTypes = {
  localLab: PropTypes.object,
  setLocalLab: PropTypes.func.isRequired,
  errors: PropTypes.object,
  isExternalURI: PropTypes.bool,
  imageInputType: PropTypes.string,
  setImageInputType: PropTypes.func,
  imageUrls: PropTypes.array,
  imageLinkRef: PropTypes.object,
  imageUploadRef: PropTypes.object,
  handleImageChange: PropTypes.func,
  removeImage: PropTypes.func,
  localImages: PropTypes.array,
  docInputType: PropTypes.string,
  setDocInputType: PropTypes.func,
  docUrls: PropTypes.array,
  docLinkRef: PropTypes.object,
  docUploadRef: PropTypes.object,
  handleDocChange: PropTypes.func,
  removeDoc: PropTypes.func,
  localDocs: PropTypes.array,
  nameRef: PropTypes.object,
  categoryRef: PropTypes.object,
  keywordsRef: PropTypes.object,
  descriptionRef: PropTypes.object,
  priceRef: PropTypes.object,
  authRef: PropTypes.object,
  accessURIRef: PropTypes.object,
  accessKeyRef: PropTypes.object,
  timeSlotsRef: PropTypes.object,
  availableHoursStartRef: PropTypes.object,
  availableHoursEndRef: PropTypes.object,
  maxConcurrentUsersRef: PropTypes.object,
  termsUrlRef: PropTypes.object,
  termsShaRef: PropTypes.object,
  showMediaSections: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}
