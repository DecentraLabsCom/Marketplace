import PropTypes from 'prop-types'
import AppProviders from '@/components/layout/AppProviders'

export default function AppLayout({ children }) {
  return (
    <AppProviders>
      {children}
    </AppProviders>
  )
}

AppLayout.propTypes = {
  children: PropTypes.node.isRequired
}
