import React from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import PendingPayoutsPanel from './PendingPayoutsPanel'

/**
 * Wrapper component that renders the Provider Receivables modal.
 * Shows revenue breakdown and settlement request controls.
 */
export default function ProviderStakingModal({
  isOpen,
  onClose,
  labs = [],
  isSSO = false,
  addTemporaryNotification,
  onRequestSettlement,
  isSettlementEnabled = false,
  isRequestingSettlement = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Provider Receivables" size="xl" className="max-h-[80vh] overflow-auto max-w-180!">
      <PendingPayoutsPanel
        labs={labs}
        onRequestSettlement={onRequestSettlement}
        isSettlementEnabled={isSettlementEnabled}
        isSSO={isSSO}
        isRequestingSettlement={isRequestingSettlement}
      />
    </Modal>
  )
}

ProviderStakingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  labs: PropTypes.array,
  isSSO: PropTypes.bool,
  addTemporaryNotification: PropTypes.func,
  onRequestSettlement: PropTypes.func,
  isSettlementEnabled: PropTypes.bool,
  isRequestingSettlement: PropTypes.bool,
}
