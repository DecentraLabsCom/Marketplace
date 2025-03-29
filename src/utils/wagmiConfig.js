import { http, createConfig } from 'wagmi'
import { mainnet, polygon } from 'wagmi/chains'
import { walletConnect, metaMask} from 'wagmi/connectors'

const projectId = '0443f18af8d74de3915be673597dd4eb' // Your Infura Project ID

export const config = createConfig({
  chains: [mainnet, polygon],
  connectors: [
    walletConnect({ projectId }),
    metaMask(),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
})