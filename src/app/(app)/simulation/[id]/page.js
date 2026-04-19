import PropTypes from 'prop-types'
import SimulationPage from '@/components/simulation/SimulationPage'

export default async function SimulationPageWrapper({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const reservationKey = sp?.reservationKey || null;
  return <SimulationPage id={id} reservationKey={reservationKey} />
}

SimulationPageWrapper.propTypes = {
  params: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  searchParams: PropTypes.object
}
