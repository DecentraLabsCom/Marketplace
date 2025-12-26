import PropTypes from 'prop-types'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import ClientOnly from '@/components/layout/ClientOnly'

export default function MarketingLayout({ children }) {
  return (
    <>
      <header className="sticky top-0 z-50">
        <ClientOnly fallback={<div className="bg-header-bg text-hover-dark p-3 shadow-md h-20" />}>
          <Navbar />
        </ClientOnly>
      </header>
      <main className="grow">
        {children}
      </main>
      <Footer />
    </>
  )
}

MarketingLayout.propTypes = {
  children: PropTypes.node.isRequired
}
