import '../styles/global.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '../utils/wagmiConfig'
import { LabData } from '../context/LabContext'
import { UserProvider } from '../context/UserContext';
import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const queryClient = new QueryClient()

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>DecentraLabs Marketplace</title>
      </Head>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <UserProvider>
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
          </UserProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  )
}

export default MyApp