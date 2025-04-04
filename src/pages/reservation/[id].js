import { useRouter } from 'next/router'
import LabReservationPage from '../LabReservationPage'

export default function LabDetailWrapper() {
  const router = useRouter()
  const { id } = router.query

  return <LabReservationPage id={id} />
}