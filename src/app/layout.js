import 'react-datepicker/dist/react-datepicker.css'
import '@/styles/global.css'
import PropTypes from 'prop-types'

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
      <head>
        <link rel="preconnect" href="https://mm-sdk-analytics.api.cx.metamask.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://ethereum-sepolia-rpc.publicnode.com" crossOrigin="anonymous" />
      </head>
      <body className="flex flex-col min-h-screen bg-[#262B2D]">
        {children}
      </body>
    </html>
  )
}

// PropTypes
RootLayout.propTypes = {
  children: PropTypes.node.isRequired
}
