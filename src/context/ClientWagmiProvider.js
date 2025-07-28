"use client";
import PropTypes from 'prop-types'
import { WagmiProvider } from 'wagmi'
import config from '@/utils/blockchain/wagmiConfig' 

/**
 * Wagmi provider with blockchain configuration
 * Wraps the application with wagmi context for wallet and blockchain interactions
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with wagmi context
 * @returns {JSX.Element} Wagmi provider with blockchain configuration
 */
export default function ClientWagmiProvider({ children }) { 
    return <WagmiProvider config={config}>{children}</WagmiProvider>;
}

ClientWagmiProvider.propTypes = {
  children: PropTypes.node.isRequired
}