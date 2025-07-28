/**
 * File upload manager component for handling lab images and documents
 * Supports both URL links and file uploads with preview functionality
 */
import React, { useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'

/**
 * File upload manager component
 * @param {Object} props
 * @param {string} props.type - File type ('image' or 'document')
 * @param {string} props.inputType - Input type ('link' or 'upload')
 * @param {Array} props.urls - Array of URL strings
 * @param {Array} props.files - Array of uploaded files
 * @param {Function} props.onInputTypeChange - Callback when input type changes
 * @param {Function} props.onUrlAdd - Callback when URL is added
 * @param {Function} props.onUrlRemove - Callback when URL is removed
 * @param {Function} props.onFileAdd - Callback when file is added
 * @param {Function} props.onFileRemove - Callback when file is removed
 * @param {Function} props.onFileUpload - Callback for file upload
 * @param {string} props.labId - Lab ID for upload destination
 * @param {boolean} props.disabled - Whether controls are disabled
 * @param {number} props.maxFiles - Maximum number of files allowed
 */
export default function FileUploadManager({
  type = 'image',
  inputType = 'link',
  urls = [],
  files = [],
  onInputTypeChange,
  onUrlAdd,
  onUrlRemove,
  onFileAdd,
  onFileRemove,
  onFileUpload,
  labId,
  disabled = false,
  maxFiles = 5
}) {
  const linkInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const isImage = type === 'image'
  const fileTypeLabel = isImage ? 'Image' : 'Document'
  const acceptedTypes = isImage ? 'image/*' : '.pdf,.doc,.docx,.txt'
  const placeholder = isImage 
    ? 'Enter image URL (e.g., https://example.com/image.jpg)'
    : 'Enter document URL (e.g., https://example.com/doc.pdf)'

  /**
   * Handle adding URL from input
   */
  const handleAddUrl = useCallback(() => {
    const url = linkInputRef.current?.value?.trim()
    if (!url) return

    try {
      new URL(url) // Validate URL format
      onUrlAdd(url)
      linkInputRef.current.value = ''
    } catch (error) {
      devLog.error(`Invalid ${type} URL:`, error)
      alert(`Please enter a valid ${type} URL`)
    }
  }, [onUrlAdd, type])

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((event) => {
    const selectedFiles = Array.from(event.target.files)
    
    if (files.length + selectedFiles.length > maxFiles) {
      alert(`Maximum ${maxFiles} ${type}s allowed`)
      return
    }

    selectedFiles.forEach(file => {
      // Validate file type for images
      if (isImage && !file.type.startsWith('image/')) {
        alert('Please select valid image files')
        return
      }
      
      onFileAdd(file)
    })

    // Reset input
    event.target.value = ''
  }, [files.length, maxFiles, type, isImage, onFileAdd])

  /**
   * Handle file upload
   */
  const handleUploadFiles = useCallback(async () => {
    if (files.length === 0 || !onFileUpload) return

    try {
      await onFileUpload(files, type, labId)
    } catch (error) {
      devLog.error(`${fileTypeLabel} upload failed:`, error)
      alert(`Failed to upload ${type}s. Please try again.`)
    }
  }, [files, onFileUpload, type, labId, fileTypeLabel])

  /**
   * Render URL list
   */
  const renderUrlList = () => {
    if (urls.length === 0) return null

    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          {fileTypeLabel} URLs ({urls.length})
        </h4>
        <div className="space-y-2">
          {urls.map((url, index) => (
            <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
              <span className="text-sm text-gray-600 truncate flex-1 mr-2">
                {url}
              </span>
              <button
                type="button"
                onClick={() => onUrlRemove(index)}
                className="text-red-600 hover:text-red-800 text-sm"
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  /**
   * Render file list
   */
  const renderFileList = () => {
    if (files.length === 0) return null

    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Selected {fileTypeLabel}s ({files.length})
        </h4>
        <div className="space-y-2">
          {files.map((file, index) => (
            <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
              <div className="flex items-center flex-1">
                {isImage && file.type.startsWith('image/') && (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-8 h-8 object-cover rounded mr-2"
                  />
                )}
                <span className="text-sm text-gray-600 truncate">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => onFileRemove(index)}
                className="text-red-600 hover:text-red-800 text-sm ml-2"
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        
        {files.length > 0 && onFileUpload && (
          <button
            type="button"
            onClick={handleUploadFiles}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={disabled}
          >
            Upload {fileTypeLabel}s
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Input Type Toggle */}
      <div className="flex space-x-4">
        <label className="flex items-center">
          <input
            type="radio"
            name={`${type}-input-type`}
            value="link"
            checked={inputType === 'link'}
            onChange={(e) => onInputTypeChange(e.target.value)}
            disabled={disabled}
            className="mr-2"
          />
          URL Link
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            name={`${type}-input-type`}
            value="upload"
            checked={inputType === 'upload'}
            onChange={(e) => onInputTypeChange(e.target.value)}
            disabled={disabled}
            className="mr-2"
          />
          File Upload
        </label>
      </div>

      {/* URL Input */}
      {inputType === 'link' && (
        <div className="space-y-2">
          <div className="flex space-x-2">
            <input
              ref={linkInputRef}
              type="url"
              placeholder={placeholder}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={disabled || urls.length >= maxFiles}
              onKeyPress={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <button
              type="button"
              onClick={handleAddUrl}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={disabled || urls.length >= maxFiles}
            >
              Add
            </button>
          </div>
          {urls.length >= maxFiles && (
            <p className="text-sm text-yellow-600">
              Maximum {maxFiles} {type}s reached
            </p>
          )}
        </div>
      )}

      {/* File Upload */}
      {inputType === 'upload' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes}
            multiple
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            disabled={disabled || files.length >= maxFiles}
          />
          {files.length >= maxFiles && (
            <p className="text-sm text-yellow-600">
              Maximum {maxFiles} {type}s reached
            </p>
          )}
        </div>
      )}

      {/* Display Lists */}
      {inputType === 'link' && renderUrlList()}
      {inputType === 'upload' && renderFileList()}
    </div>
  )
}

FileUploadManager.propTypes = {
  type: PropTypes.oneOf(['image', 'document']).isRequired,
  inputType: PropTypes.oneOf(['link', 'upload']).isRequired,
  urls: PropTypes.arrayOf(PropTypes.string),
  files: PropTypes.arrayOf(PropTypes.object),
  onInputTypeChange: PropTypes.func.isRequired,
  onUrlAdd: PropTypes.func.isRequired,
  onUrlRemove: PropTypes.func.isRequired,
  onFileAdd: PropTypes.func.isRequired,
  onFileRemove: PropTypes.func.isRequired,
  onFileUpload: PropTypes.func,
  labId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  disabled: PropTypes.bool,
  maxFiles: PropTypes.number
}
