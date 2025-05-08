"use client";
import { usePathname } from 'next/navigation';
import { useDisconnect, useEnsAvatar, useEnsName } from 'wagmi';
import { useUser } from '../context/UserContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function Account() {
  const { isConnected, address, user } = useUser();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName });
  const pathname = usePathname();

  const handleDisconnect = async () => {
    if (isConnected) disconnect();
    if (user) {
      await fetch("/api/auth/logout");
      if (pathname !== "/") {
        window.location.href = "/";
      }
    }
  }

  return (
    <div className="flex items-center space-x-6 ml-auto font-bold">
      {isConnected && address && (
        <div className="pointer-events-none flex flex-col items-center">
          <div className="text-sm text-[#333f63]">{formatAddress(address)}</div>
          {(user?.name || ensName) && (
            <div className="text-[14px] text-[#335763]">
              {user?.name
                ? user.name
                : ensName
                  ? ensName
                  : null
              }
            </div>
          )}
        </div>
      )}
      <button onClick={handleDisconnect}>
        <FontAwesomeIcon icon={faSignOutAlt} className="text-[#715c8c] font-semibold text-4xl
                hover:text-[#333f63]" title={isConnected ? "Disconnect Wallet" : "Logout"}/>
      </button>
    </div>
  )
}