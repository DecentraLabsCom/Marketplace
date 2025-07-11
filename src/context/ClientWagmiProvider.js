"use client";
import { WagmiProvider } from "wagmi"; 
import config from "@/utils/wagmiConfig"; 

export default function ClientWagmiProvider({ children }) { 
    return <WagmiProvider config={config}>{children}</WagmiProvider>;
}