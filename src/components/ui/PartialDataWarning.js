/**
 * PartialDataWarning component
 * Displays warnings when data was loaded with partial failures
 * Provides user feedback about data quality without blocking functionality
 */
"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { Alert } from '@/components/ui'

/**
 * Warning component for partial data loading
 * @param {Object} props
 * @param {Object} props.errorInfo - Error information from service
 * @param {boolean} props.errorInfo.hasErrors - Whether there were any errors
 * @param {string} props.errorInfo.message - Human-readable error message
 * @param {Array} [props.errorInfo.failedKeys] - Array of failed keys (for user bookings)
 * @param {string} [props.dataType] - Type of data for context (e.g., "bookings", "labs")
 * @param {boolean} [props.showDetails=false] - Whether to show detailed error information
 * @returns {JSX.Element|null} Warning alert or null if no errors
 */
export default function PartialDataWarning({ 
  errorInfo, 
  dataType = "data", 
  showDetails = false 
}) {
  // Don't render if no errors
  if (!errorInfo?.hasErrors) {
    return null;
  }

  const { message, failedKeys } = errorInfo;

  return (
    <Alert 
      variant="warning" 
      className="mb-4"
      dismissible={false}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0">
          ⚠️
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-amber-800 dark:text-amber-200">
            Partial {dataType} loaded
          </h4>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            {message}
          </p>
          
          {showDetails && failedKeys && failedKeys.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100">
                Show failed items ({failedKeys.length})
              </summary>
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                <ul className="list-disc list-inside space-y-1">
                  {failedKeys.map((failure, index) => (
                    <li key={index}>
                      <span className="font-mono">{failure.key}</span>
                      {failure.error && (
                        <span className="ml-2 opacity-75">- {failure.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
          
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            This usually happens due to network issues or rate limiting. 
            The displayed {dataType} is still usable.
          </p>
        </div>
      </div>
    </Alert>
  );
}

PartialDataWarning.propTypes = {
  errorInfo: PropTypes.shape({
    hasErrors: PropTypes.bool.isRequired,
    message: PropTypes.string.isRequired,
    failedKeys: PropTypes.arrayOf(PropTypes.shape({
      key: PropTypes.string.isRequired,
      error: PropTypes.string
    }))
  }).isRequired,
  dataType: PropTypes.string,
  showDetails: PropTypes.bool
}
