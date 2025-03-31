import { useRouter } from 'next/router'
import LabDetailPage from '../LabDetailPage'

export default function LabDetailWrapper() {
  const router = useRouter()
  const { id } = router.query

  return <LabDetailPage id={id} />
}