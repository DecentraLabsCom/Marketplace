import LabDetail from '@/components/LabDetail'

export default async function LabDetailWrapper({ params }) {
  const { id, provider } = await params;
  return <LabDetail id={id} provider={provider} />
}