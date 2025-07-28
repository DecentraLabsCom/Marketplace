/**
 * Lab form wizard component with Quick and Full setup modes
 * Simplified version of LabModal with better separation of concerns
 */
import React, { useState, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { useLabToken } from '@/hooks/useLabToken'
import { useLabValidation } from '@/hooks/lab/useLabValidation'
import LabFormFullSetup from '@/components/dashboard/provider/LabFormFullSetup'
import LabFormQuickSetup from '@/components/dashboard/provider/LabFormQuickSetup'
import FileUploadManager from '@/components/ui/FileUploadManager'
import devLog from '@/utils/dev/logger'

/**
 * Lab form wizard with tabbed interface
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Function} props.onSubmit - Callback to submit lab data
 * @param {Object} props.lab - Lab object for editing (null for creating new lab)
 * @param {number} props.maxId - Maximum lab ID for generating new lab IDs
 */
export default function LabFormWizard({ isOpen, onClose, onSubmit, lab = {}, maxId = 0 }) {
  const { decimals, formatPrice } = useLabToken()
  
  // Form state
  const [activeTab, setActiveTab] = useState('full')
  const [formData, setFormData] = useState({ ...lab })
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // File management state
  const [imageInputType, setImageInputType] = useState('link')
  const [docInputType, setDocInputType] = useState('link')
  const [imageUrls, setImageUrls] = useState(lab.imageUrls || [])
  const [docUrls, setDocUrls] = useState(lab.docUrls || [])
  const [localImages, setLocalImages] = useState([])
  const [localDocs, setLocalDocs] = useState([])
  
  // URI state
  const [isExternalURI, setIsExternalURI] = useState(false)
  const [isLocalURI, setIsLocalURI] = useState(false)
  const [clickedToEditUri, setClickedToEditUri] = useState(false)

  // Form refs
  const refs = {
    name: useRef(null),
    category: useRef(null),
    keywords: useRef(null),
    description: useRef(null),
    price: useRef(null),
    auth: useRef(null),
    accessURI: useRef(null),
    accessKey: useRef(null),
    timeSlots: useRef(null),
    opens: useRef(null),
    closes: useRef(null),
    uri: useRef(null)
  }

  // Validation hook
  const {
    validateLab,
    getErrors,
    isValid
  } = useLabValidation(formData, activeTab, refs)

  const currentLabId = lab.id || maxId + 1

  /**
   * Update form data
   */
  const updateFormData = useCallback((updates) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }, [])

  /**
   * Handle tab change
   */
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
  }, [])

  /**
   * File upload handler
   */
  const uploadFile = useCallback(async (file, destinationFolder, labId) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('destinationFolder', destinationFolder)
    formData.append('labId', labId)

    const response = await fetch('/api/provider/uploadFile', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Upload error: ${response.statusText}`)
    }

    return response.json()
  }, [])

  /**
   * Handle multiple file uploads
   */
  const handleFileUpload = useCallback(async (files, type, labId) => {
    const destinationFolder = type === 'image' ? 'images' : 'docs'
    
    try {
      const uploadPromises = files.map(file => uploadFile(file, destinationFolder, labId))
      const results = await Promise.all(uploadPromises)
      
      // Update URLs with uploaded file paths
      const uploadedUrls = results.map(result => result.url)
      
      if (type === 'image') {
        setImageUrls(prev => [...prev, ...uploadedUrls])
        setLocalImages([])
      } else {
        setDocUrls(prev => [...prev, ...uploadedUrls])
        setLocalDocs([])
      }
      
      devLog.log(`✅ ${type} upload completed:`, uploadedUrls)
    } catch (error) {
      devLog.error(`❌ ${type} upload failed:`, error)
      throw error
    }
  }, [uploadFile])

  /**
   * Image management handlers
   */
  const imageHandlers = {
    onInputTypeChange: setImageInputType,
    onUrlAdd: useCallback((url) => setImageUrls(prev => [...prev, url]), []),
    onUrlRemove: useCallback((index) => setImageUrls(prev => prev.filter((_, i) => i !== index)), []),
    onFileAdd: useCallback((file) => setLocalImages(prev => [...prev, file]), []),
    onFileRemove: useCallback((index) => setLocalImages(prev => prev.filter((_, i) => i !== index)), []),
    onFileUpload: handleFileUpload
  }

  /**
   * Document management handlers
   */
  const docHandlers = {
    onInputTypeChange: setDocInputType,
    onUrlAdd: useCallback((url) => setDocUrls(prev => [...prev, url]), []),
    onUrlRemove: useCallback((index) => setDocUrls(prev => prev.filter((_, i) => i !== index)), []),
    onFileAdd: useCallback((file) => setLocalDocs(prev => [...prev, file]), []),
    onFileRemove: useCallback((index) => setLocalDocs(prev => prev.filter((_, i) => i !== index)), []),
    onFileUpload: handleFileUpload
  }

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(async () => {
    const labData = {
      ...formData,
      imageUrls,
      docUrls,
      id: currentLabId
    }

    const validation = validateLab(labData, activeTab)
    
    if (!validation.isValid) {
      devLog.warn('❌ Form validation failed:', validation.errors)
      return
    }

    setIsSubmitting(true)
    
    try {
      await onSubmit(labData, activeTab)
      onClose()
    } catch (error) {
      devLog.error('❌ Form submission failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, imageUrls, docUrls, currentLabId, validateLab, activeTab, onSubmit, onClose])

  /**
   * Reset form
   */
  const handleReset = useCallback(() => {
    setFormData({ ...lab })
    setImageUrls(lab.imageUrls || [])
    setDocUrls(lab.docUrls || [])
    setLocalImages([])
    setLocalDocs([])
    setIsExternalURI(false)
    setIsLocalURI(false)
    setClickedToEditUri(false)
  }, [lab])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {lab.id ? 'Edit Lab' : 'Create New Lab'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isSubmitting}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-1 mt-4">
            <button
              onClick={() => handleTabChange('full')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === 'full'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              disabled={isSubmitting}
            >
              Full Setup
            </button>
            <button
              onClick={() => handleTabChange('quick')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === 'quick'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              disabled={isSubmitting}
            >
              Quick Setup
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] px-6 py-4">
          {activeTab === 'full' ? (
            <LabFormFullSetup
              localLab={formData}
              setLocalLab={updateFormData}
              errors={getErrors(formData)}
              isExternalURI={isExternalURI}
              imageInputType={imageInputType}
              docInputType={docInputType}
              setImageInputType={setImageInputType}
              setDocInputType={setDocInputType}
              setIsExternalURI={setIsExternalURI}
              isLocalURI={isLocalURI}
              setIsLocalURI={setIsLocalURI}
              clickedToEditUri={clickedToEditUri}
              setClickedToEditUri={setClickedToEditUri}
              imageUrls={imageUrls}
              docUrls={docUrls}
              localImages={localImages}
              localDocs={localDocs}
              refs={refs}
            />
          ) : (
            <LabFormQuickSetup
              localLab={formData}
              setLocalLab={updateFormData}
              errors={getErrors(formData)}
              isLocalURI={isLocalURI}
              priceRef={refs.price}
              authRef={refs.auth}
            />
          )}

          {/* File Upload Sections */}
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Images</h3>
              <FileUploadManager
                type="image"
                inputType={imageInputType}
                urls={imageUrls}
                files={localImages}
                labId={currentLabId}
                disabled={isSubmitting}
                {...imageHandlers}
              />
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Documents</h3>
              <FileUploadManager
                type="document"
                inputType={docInputType}
                urls={docUrls}
                files={localDocs}
                labId={currentLabId}
                disabled={isSubmitting}
                {...docHandlers}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Reset
          </button>
          <div className="space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting || !isValid(formData)}
            >
              {isSubmitting ? 'Saving...' : (lab.id ? 'Update Lab' : 'Create Lab')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

LabFormWizard.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  lab: PropTypes.object,
  maxId: PropTypes.number
}
