import PropTypes from 'prop-types'
import AppProviders from '@/components/layout/AppProviders'

export default function MarketingLayout({ children }) {
  return (
    <AppProviders>
      {children}
    </AppProviders>
  )
}

MarketingLayout.propTypes = {
  children: PropTypes.node.isRequired
}
