import { useRouter } from 'next/router'
import LabReservation from '../../components/LabReservation'

export default function LabReservationWrapper() {
  const router = useRouter()
  const { id } = router.query

  return <LabReservation id={id} />
}