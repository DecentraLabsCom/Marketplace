import 'react-datepicker/dist/react-datepicker.css'
import '@fortawesome/fontawesome-svg-core/styles.css'
import '@/styles/global.css'
import PropTypes from 'prop-types'
import { getBaseUrl } from '@/utils/env/baseUrl'
import FontAwesomeConfig from '@/components/layout/FontAwesomeConfig'

// The nonce in proxy.js is request-specific, so every document must be rendered
// on demand for Next.js to propagate it to generated script tags.
export const dynamic = 'force-dynamic'

const marketplaceBaseUrl = getBaseUrl()

export const metadata = {
    metadataBase: new URL(marketplaceBaseUrl),
    title: 'DecentraLabs Marketplace',
    description: 'DecentraLabs Marketplace for institutionally managed online laboratories.',
  tags: 'NFT blockchain decentralized remote labs online experimentation',
    keywords: 'NFT blockchain decentralized remote labs online experimentation',
    openGraph: {
        title: 'DecentraLabs Marketplace',
        description: 'DecentraLabs Marketplace for institutionally managed online laboratories.',
        url: marketplaceBaseUrl,
        images: [
            {
            url: '/favicon.svg',
            width: 800,
            height: 600,
            },
        ],
        },
    twitter: {
        card: 'summary_large_image',
        title: 'DecentraLabs Marketplace',
        description: 'DecentraLabs Marketplace for institutionally managed online laboratories.',
        images: [
            {
            url: '/favicon.svg',
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
      <head>
        <link rel="preconnect" href="https://ethereum-sepolia-rpc.publicnode.com" crossOrigin="anonymous" />
      </head>
      <body className="flex flex-col min-h-screen bg-[#262B2D]">
        <FontAwesomeConfig />
        {children}
      </body>
    </html>
  )
}

// PropTypes
RootLayout.propTypes = {
  children: PropTypes.node.isRequired
}
