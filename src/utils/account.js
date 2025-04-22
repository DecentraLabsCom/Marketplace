import { useAccount, useDisconnect, useEnsAvatar, useEnsName } from 'wagmi'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function Account({isConnected, username}) {
  const { address } = useAccount()
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address })
  const { data: ensAvatar } = useEnsAvatar({ name: ensName })

  const handleDisconnect = () => {
    if (isConnected) disconnect();
    if (username) window.location.href = "/api/auth/sso/logout";
  }

  return (
    <div className="flex items-center space-x-6 ml-auto font-bold">
      {isConnected && (
      <div className="pointer-events-none">
        {address && <div className="text-sm">{ensName ? `${ensName} 
        (${formatAddress(address)})` : formatAddress(address)}</div>}
      </div>)}
      {username && (
      <div className="text-sm font-bold">{username}</div>
      )}
      <button onClick={handleDisconnect}>
        <FontAwesomeIcon icon={faSignOutAlt} className="text-[#715c8c] font-semibold text-4xl
                hover:text-[#333f63]" title={isConnected ? "Disconnect Wallet" : "Logout"}/>
      </button>
    </div>
  )
}