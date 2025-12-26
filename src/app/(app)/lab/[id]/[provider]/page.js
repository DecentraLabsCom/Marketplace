import PropTypes from 'prop-types'
import LabDetail from '@/components/lab/LabDetail'

export default async function LabDetailWrapper({ params }) {
  const { id } = await params;
  return <LabDetail id={id} />
}

// PropTypes
LabDetailWrapper.propTypes = {
  params: PropTypes.shape({
    id: PropTypes.string.isRequired,
    provider: PropTypes.string.isRequired
  }).isRequired
}