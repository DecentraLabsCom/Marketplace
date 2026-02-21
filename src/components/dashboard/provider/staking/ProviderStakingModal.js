import React from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import ProviderStakingPanel from './ProviderStakingPanel'
import PendingPayoutsPanel from './PendingPayoutsPanel'

/**
 * Wrapper component that renders the full `Staking & Economics` modal.
 * Keeps ProviderDashboardPage smaller by extracting the Modal JSX.
 */
export default function ProviderStakingModal({
  isOpen,
  onClose,
  providerAddress,
  labs = [],
  isSSO = false,
  labCount = 0,
  addTemporaryNotification,
  onCollectAll,
  isCollecting = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Staking & Economics" size="xl" className="max-h-[80vh] overflow-auto max-w-180!">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProviderStakingPanel
          providerAddress={providerAddress}
          isSSO={isSSO}
          labCount={labCount}
          addTemporaryNotification={addTemporaryNotification}
        />
        <PendingPayoutsPanel
          labs={labs}
          onCollectAll={onCollectAll}
          isSSO={isSSO}
          isCollecting={isCollecting}
        />
      </div>
    </Modal>
  )
}

ProviderStakingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  providerAddress: PropTypes.string.isRequired,
  labs: PropTypes.array,
  isSSO: PropTypes.bool,
  labCount: PropTypes.number,
  addTemporaryNotification: PropTypes.func,
  onCollectAll: PropTypes.func,
  isCollecting: PropTypes.bool,
}
