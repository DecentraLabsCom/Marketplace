import React from 'react'
import PropTypes from 'prop-types'
import { getRoleDisplayName } from '@/utils/auth/roleValidation'

/**
 * Renders access denied message for invalid SSO roles
 * @param {Object} props - Component props
 * @param {string} props.reason - Reason for access denial
 * @param {string} props.userRole - User's current role
 * @param {string} [props.scopedRole] - User's scoped role (optional)
 * @returns {JSX.Element} Access denied message component
 */
export default function ProviderAccessDenied({ reason, userRole, scopedRole }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px]">
      <div className="bg-white rounded-lg shadow-lg p-6 w-96 flex flex-col items-center">
        <h2 className="text-center text-lg font-bold mb-4 text-error-text">Access Denied</h2>
        <p className="text-center mb-4 text-gray-700">{reason}</p>
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-xs text-gray-600 mb-1">Your current role:</p>
          <p className="text-sm font-semibold text-gray-800">{getRoleDisplayName(userRole)}</p>
          {scopedRole && scopedRole !== userRole && (
            <p className="text-xs text-gray-600 mt-1">
              Scoped role: {getRoleDisplayName(scopedRole)}
            </p>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Eligible roles: Faculty, Staff, Employees, Members, Affiliates
        </p>
      </div>
    </div>
  )
}

ProviderAccessDenied.propTypes = {
  reason: PropTypes.string.isRequired,
  userRole: PropTypes.string.isRequired,
  scopedRole: PropTypes.string
}
