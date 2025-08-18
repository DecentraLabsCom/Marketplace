import PropTypes from 'prop-types'
import LabDetail from '@/components/lab/LabDetail'

export default async function LabDetailWrapper({ params }) {
  const { id, provider } = await params;
  return <LabDetail id={id} provider={provider} />
}

// PropTypes
LabDetailWrapper.propTypes = {
  params: PropTypes.shape({
    id: PropTypes.string.isRequired,
    provider: PropTypes.string.isRequired
  }).isRequired
}