import PropTypes from 'prop-types'
import LabReservation from '@/components/reservation/LabReservation'

export default async function LabReservationWrapper({ params }) {
  const { id } = await params;
  return <LabReservation id={id} />
}

// PropTypes
LabReservationWrapper.propTypes = {
  params: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired
}