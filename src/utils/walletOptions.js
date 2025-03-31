import { useState, useEffect, useRef } from 'react';
import { useConnect } from 'wagmi';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet } from '@fortawesome/free-solid-svg-icons';

export function WalletOptions() {
  const { connectors, connect } = useConnect()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuRef])

  return (
    <div className="relative inline-block text-left md:flex" ref={menuRef}>
      <button onClick={() => setMenuOpen(!menuOpen)}>
        <FontAwesomeIcon icon={faWallet} className="text-[#715c8c] font-semibold text-4xl
        hover:text-[#333f63]" title="Connect Wallet"/>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 
        ring-black ring-opacity-5">
          <div className="py-1">
            {connectors.map((connector) => (
              <WalletOption
                key={connector.uid}
                connector={connector}
                onClick={() => {
                  connect({ connector })
                  setMenuOpen(false)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WalletOption({ connector, onClick }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ;(async () => {
      const provider = await connector.getProvider()
      setReady(!!provider)
    })()
  }, [connector])

  return (
    <button disabled={!ready} onClick={onClick}
      className={`w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 
                  ${ready ? '' : 'cursor-not-allowed'}`}>
      {connector.name}
    </button>
  )
}