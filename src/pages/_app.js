import '../styles/global.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiConfig } from 'wagmi'
import { config } from '../utils/wagmiConfig'
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
      <WagmiConfig config={config}>
        <QueryClientProvider client={queryClient}>
          <div className="flex flex-col min-h-screen bg-[#262B2D]">
            <header className="sticky top-0 z-50">
              <Navbar />
            </header>
            <main className="flex-grow">
              <Component {...pageProps} />
            </main>
            <Footer />
          </div>
        </QueryClientProvider>
      </WagmiConfig>
    </>
  )
}

export default MyApp