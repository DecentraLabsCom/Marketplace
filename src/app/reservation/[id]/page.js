import LabReservation from '@/components/reservation/LabReservation'

export default async function LabReservationWrapper({ params }) {
  const { id } = await params;
  return <LabReservation id={id} />
}