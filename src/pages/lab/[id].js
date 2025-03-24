import { useRouter } from 'next/router'
import LabDetailPage from '../../components/LabDetailPage'

export default function LabDetailWrapper() {
  const router = useRouter()
  const { id } = router.query

  if (!id) {
    return <div className="text-center">Loading...</div>
  }

  return <LabDetailPage id={id} />
}