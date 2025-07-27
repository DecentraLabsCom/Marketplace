"use client";
import { WagmiProvider } from 'wagmi'
import config from '@/utils/blockchain/wagmiConfig' 

export default function ClientWagmiProvider({ children }) { 
    return <WagmiProvider config={config}>{children}</WagmiProvider>;
}