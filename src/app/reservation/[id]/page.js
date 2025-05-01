import LabReservation from '../../../components/LabReservation'

export default function LabReservationWrapper({ params }) {
  return <LabReservation id={params.id} />
}