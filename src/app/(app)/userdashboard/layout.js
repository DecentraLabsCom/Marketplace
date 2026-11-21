import PropTypes from 'prop-types'
import UnregisteredInstitutionNotice from '@/components/dashboard/user/UnregisteredInstitutionNotice'

export default function UserDashboardLayout({ children }) {
  return (
    <>
      <UnregisteredInstitutionNotice />
      {children}
    </>
  )
}

UserDashboardLayout.propTypes = {
  children: PropTypes.node.isRequired,
}
