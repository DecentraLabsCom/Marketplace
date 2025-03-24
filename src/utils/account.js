import { useAccount, useDisconnect, useEnsAvatar, useEnsName } from 'wagmi'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function Account() {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const { data: ensName } = useEnsName({ address })
  const { data: ensAvatar } = useEnsAvatar({ name: ensName })

  return (
    <div className="flex items-center space-x-6 ml-auto font-bold">
      <div className="pointer-events-none">
        {address && <div className="text-sm">{ensName ? `${ensName} 
        (${formatAddress(address)})` : formatAddress(address)}</div>}
      </div>
      <button onClick={() => disconnect()}>
        <FontAwesomeIcon icon={faSignOutAlt} className="text-[#715c8c] font-semibold text-4xl
                hover:text-[#333f63]"  title="Disconnect Wallet"/>
      </button>
    </div>
  )
}