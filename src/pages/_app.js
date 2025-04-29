import 'react-datepicker/dist/react-datepicker.css'
import '../styles/global.css'
import Head from 'next/head'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import config from '../utils/wagmiConfig'
import { LabData } from '../context/LabContext'
import { UserData } from '../context/UserContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const queryClient = new QueryClient()

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>DecentraLabs Marketplace</title>
      </Head>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <UserData>
            <div className="flex flex-col min-h-screen bg-[#262B2D]">
              <header className="sticky top-0 z-50">
                <Navbar />
              </header>
              <main className="flex-grow">
                <LabData>
                  <Component {...pageProps} />
                </LabData>
              </main>
              <Footer />
            </div>
          </UserData>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  )
}