"use client";
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useConnect, useDisconnect } from 'wagmi'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWallet } from '@fortawesome/free-solid-svg-icons'
import devLog from '@/utils/dev/logger'

/**
 * Wallet authentication component for connecting Web3 wallets
 * Handles multiple wallet connectors (MetaMask, WalletConnect, etc.) and connection management
 * @param {Object} props
 * @param {Function} props.setIsModalOpen - Function to control parent modal visibility
 * @returns {JSX.Element} Wallet connection interface with supported wallet options
 */
export default function WalletLogin({ setIsModalOpen }) {
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [isModalOpen, setIsModalOpenLocal] = useState(false);

  const handleWalletLogin = () => {
    setIsModalOpen(true);
    setIsModalOpenLocal(true);
  };

  const closeModal = () => {
    const walletConnectConnector = connectors.find(connector => connector.name === 'WalletConnect');
    if (walletConnectConnector?.ready) {
      disconnect();
    }
    setIsModalOpen(false);
    setIsModalOpenLocal(false);
  };

  return (
    <div>
      {/* Wallet Login Button */}
      <div onClick={handleWalletLogin}
        className="bg-[#715c8c] text-white font-bold rounded-lg px-4 py-2 transition duration-300 
        cursor-pointer ease-in-out hover:bg-[#333f63] hover:text-white flex items-center justify-center">
        <FontAwesomeIcon icon={faWallet} className="font-semibold text-4xl mr-3" title="Connect Wallet" />
        Wallet Login
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50"
          onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 text-[#333f63]">Choose Wallet</h2>
            <div className="flex flex-col space-y-4">
              {connectors.map((connector) => (
                <WalletOption key={connector.uid} connector={connector} onClick={() => {
                    try {
                      connect({ connector });
                      closeModal();
                    } catch (error) {
                      devLog.error('Error connecting wallet:', error);
                    }
                  }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletOption({ connector, onClick }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const provider = await connector.getProvider();
      setReady(!!provider);
    })();
  }, [connector]);

  return (
    <button disabled={!ready} onClick={onClick}
      className={`w-full px-4 py-2 text-left rounded-lg border transition duration-300 
          ${
            ready 
            ? 'bg-[#715c8c] text-center text-white hover:bg-[#333f63] hover:shadow-lg' 
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
    >
      {connector.name}
    </button>
  );
}

WalletLogin.propTypes = {
  setIsModalOpen: PropTypes.func.isRequired
}
