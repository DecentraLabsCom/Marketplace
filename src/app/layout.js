import 'react-datepicker/dist/react-datepicker.css'
import '@/styles/global.css'
import ClientQueryProvider from '@/context/ClientQueryProvider'
import ClientWagmiProvider from '@/context/ClientWagmiProvider'
import { UserData } from '@/context/UserContext'
import { UserEventProvider } from "@/context/UserEventContext";
import { LabData } from '@/context/LabContext'
import { BookingData } from '@/context/BookingContext'
import { LabEventProvider } from "@/context/LabEventContext";
import { ReservationEventProvider } from "@/context/BookingEventContext";
import { NotificationProvider } from "@/context/NotificationContext";
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import GlobalNotificationStack from '@/components/GlobalNotificationStack'
import DataRefreshIndicator from '@/components/DataRefreshIndicator'
import ClientOnly from '@/components/ClientOnly'

export const metadata = {
  title: 'DecentraLabs Marketplace',
  description: 'DecentraLabs is the first decentralized marketplace for laboratories and research facilities.',
  tags: 'NFT blockchain decentralized remote labs online experimentation',
    keywords: 'NFT blockchain decentralized remote labs online experimentation',
    openGraph: {
        title: 'DecentraLabs Marketplace',
        description: 'DecentraLabs is the first decentralized marketplace for laboratories and research facilities.',
        url: 'https://decentralabs.nebsyst.com',
        images: [
            {
            url: 'https://decentralabs.nebsyst.com/favicon.svg',
            width: 800,
            height: 600,
            },
        ],
        },
    twitter: {
        card: 'summary_large_image',
        title: 'DecentraLabs Marketplace',
        description: 'DecentraLabs is the first decentralized marketplace for laboratories and research facilities.',
        images: [
            {
            url: 'https://decentralabs.nebsyst.com/favicon.svg',
            width: 800,
            height: 600,
            },
        ],
    },
    icons: {
        icon: '/favicon.svg',
        shortcut: '/favicon.svg',
        apple: '/favicon.svg',
    },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen bg-[#262B2D]">
        <ClientQueryProvider>
          <ClientWagmiProvider>
            <NotificationProvider>
              <UserData>
                <UserEventProvider>
                  <LabData>
                    <BookingData>
                      <LabEventProvider>
                        <ReservationEventProvider>
                      <header className="sticky top-0 z-50">
                        <ClientOnly fallback={<div className="bg-[#caddff] text-[#333f63] p-3 shadow-md h-20" />}>
                          <Navbar />
                        </ClientOnly>
                      </header>
                      <main className="grow">
                          {children}
                      </main>
                      <Footer />
                      <GlobalNotificationStack />
                      <DataRefreshIndicator />
                    </ReservationEventProvider>
                  </LabEventProvider>
                </BookingData>
              </LabData>
              </UserEventProvider>
            </UserData>
            </NotificationProvider>
          </ClientWagmiProvider>
        </ClientQueryProvider>
      </body>
    </html>
  )
}
