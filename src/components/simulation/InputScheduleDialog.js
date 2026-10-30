'use client'

import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import InputScheduleEditor from './InputScheduleEditor'

export default function InputScheduleDialog({
  isOpen,
  onClose,
  variables,
  modelVariables,
  initialValues,
  events,
  startTime,
  stopTime,
  stepSize,
  validationError,
  disabled,
  onChange,
  zIndex,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule variable changes"
      size="2xl"
      theme="dark"
      className="bg-[#101a20]! border border-[#263a42]"
      portal
      zIndex={zIndex}
    >
      <InputScheduleEditor
        variables={variables}
        modelVariables={modelVariables}
        initialValues={initialValues}
        events={events}
        startTime={startTime}
        stopTime={stopTime}
        stepSize={stepSize}
        validationError={validationError}
        disabled={disabled}
        tooltipPortal
        onChange={onChange}
      />
    </Modal>
  )
}

InputScheduleDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  variables: PropTypes.arrayOf(PropTypes.object).isRequired,
  modelVariables: PropTypes.arrayOf(PropTypes.object).isRequired,
  initialValues: PropTypes.object.isRequired,
  events: PropTypes.arrayOf(PropTypes.object),
  startTime: PropTypes.number,
  stopTime: PropTypes.number.isRequired,
  stepSize: PropTypes.number,
  validationError: PropTypes.string,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  zIndex: PropTypes.number,
}

InputScheduleDialog.defaultProps = {
  events: [],
  startTime: 0,
  stepSize: 0.01,
  validationError: '',
  disabled: false,
  zIndex: 50,
}
