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
  onCollect,
  isCollectEnabled = false,
  isCollecting = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Provider Receivables" size="xl" className="max-h-[80vh] overflow-auto max-w-180!">
      <PendingPayoutsPanel
        labs={labs}
        onCollect={onCollect}
        isCollectEnabled={isCollectEnabled}
        isSSO={isSSO}
        isCollecting={isCollecting}
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
  onCollect: PropTypes.func,
  isCollectEnabled: PropTypes.bool,
  isCollecting: PropTypes.bool,
}
