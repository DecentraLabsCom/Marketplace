'use client'

import PropTypes from 'prop-types'
import dynamic from 'next/dynamic'
import ClientQueryProvider from '@/context/ClientQueryProvider'
import ClientWagmiProvider from '@/context/ClientWagmiProvider'
import { UserData } from '@/context/UserContext'
import { LabTokenProvider } from '@/context/LabTokenContext'
import { UserEventProvider } from '@/context/UserEventContext'
import { LabEventProvider } from '@/context/LabEventContext'
import { BookingEventProvider } from '@/context/BookingEventContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OptimisticUIProvider } from '@/context/OptimisticUIContext'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import ClientOnly from '@/components/layout/ClientOnly'

const GlobalNotificationStack = dynamic(() => import('@/components/layout/GlobalNotificationStack'))
const DataRefreshIndicator = dynamic(() => import('@/components/layout/DataRefreshIndicator'))
const PopupBlockerModal = dynamic(() => import('@/components/layout/PopupBlockerModal'))
const InstitutionalOnboardingWrapper = dynamic(
  () => import('@/components/auth/InstitutionalOnboardingWrapper')
)

export default function AppProviders({ children }) {
  return (
    <ClientQueryProvider>
      <ClientWagmiProvider>
        <NotificationProvider>
          <OptimisticUIProvider>
            <UserData>
              <LabTokenProvider>
                <UserEventProvider>
                  <LabEventProvider>
                    <BookingEventProvider>
                      <header className="sticky top-0 z-50">
                        <ClientOnly fallback={<div className="bg-header-bg text-hover-dark p-3 shadow-md h-20" />}>
                          <Navbar />
                        </ClientOnly>
                      </header>
                      <main className="grow">
                        {children}
                      </main>
                      <Footer />
                      <GlobalNotificationStack />
                      <PopupBlockerModal />
                      <DataRefreshIndicator />
                      <ClientOnly>
                        <InstitutionalOnboardingWrapper />
                      </ClientOnly>
                    </BookingEventProvider>
                  </LabEventProvider>
                </UserEventProvider>
              </LabTokenProvider>
            </UserData>
          </OptimisticUIProvider>
        </NotificationProvider>
      </ClientWagmiProvider>
    </ClientQueryProvider>
  )
}

AppProviders.propTypes = {
  children: PropTypes.node.isRequired
}
