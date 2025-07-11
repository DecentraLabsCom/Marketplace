import LabReservation from '@/components/LabReservation'

export default async function LabReservationWrapper({ params }) {
  const { id } = await params;
  return <LabReservation id={id} />
}