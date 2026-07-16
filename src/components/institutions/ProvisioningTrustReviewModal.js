"use client"

import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'

export default function ProvisioningTrustReviewModal({
  isOpen,
  institutionId,
  walletAddress,
  backendOrigin,
  registrationType,
  onConfirm,
  onClose,
  isSubmitting = false,
}) {
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (isOpen) setAcknowledged(false)
  }, [isOpen])

  const typeLabel = registrationType === 'consumer' ? 'Consumer' : 'Provider'

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title="Review institutional trust"
      size="md"
    >
      <div className="space-y-4 text-sm text-gray-700">
        <p>
          This configuration will bind your institution to trusted infrastructure. Review the exact values before generating the short-lived token.
        </p>
        <dl className="grid gap-3 rounded border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Institution</dt>
            <dd className="break-all">{institutionId || 'Verified from the SSO session'}</dd>
          </div>
          <div>
            <dt className="font-semibold">Registration type</dt>
            <dd>{typeLabel}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold">Institutional wallet</dt>
            <dd className="break-all font-mono text-xs">{walletAddress}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold">Canonical backend and metadata trust origin</dt>
            <dd className="break-all font-mono text-xs">{backendOrigin}</dd>
          </div>
        </dl>
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950">
          This grants trust to this exact origin only. Subdomains are not trusted automatically. A separate metadata host needs a reviewed global exception.
        </p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-1"
          />
          <span>I have verified that this origin and wallet are controlled by the institution.</span>
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!acknowledged || isSubmitting}
            className="rounded bg-brand px-4 py-2 font-semibold text-white hover:bg-hover-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Generating...' : 'Generate provisioning token'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

ProvisioningTrustReviewModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  institutionId: PropTypes.string,
  walletAddress: PropTypes.string.isRequired,
  backendOrigin: PropTypes.string.isRequired,
  registrationType: PropTypes.oneOf(['provider', 'consumer']).isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isSubmitting: PropTypes.bool,
}
