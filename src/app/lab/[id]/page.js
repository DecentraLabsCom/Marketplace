import LabDetail from '../../../components/LabDetail'

export default function LabDetailWrapper({ params }) {
  return <LabDetail id={params.id} />
}