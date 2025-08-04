import LabDetail from '@/components/lab/LabDetail'

export default async function LabDetailWrapper({ params }) {
  const { id } = await params;
  return <LabDetail id={id} />
}