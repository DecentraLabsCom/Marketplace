import LabDetail from '../../../components/LabDetail'

export default async function LabDetailWrapper({ params }) {
  const { id } = await params;
  return <LabDetail id={id} />
}