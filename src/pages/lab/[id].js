import { useRouter } from 'next/router'
import LabDetail from '../../components/LabDetail'

export default function LabDetailWrapper() {
  const router = useRouter()
  const { id } = router.query

  return <LabDetail id={id} />
}