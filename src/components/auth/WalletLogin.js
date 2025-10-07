"use client";
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Image from 'next/image'
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
      <button 
        onClick={handleWalletLogin}
        className="group w-full p-4 text-left rounded-xl border bg-brand border-brand hover:bg-hover-dark hover:shadow-lg text-white transition-all duration-300 hover:scale-[1.02]"
      >
        <div className="flex items-center space-x-4">
          <div className="size-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
            <FontAwesomeIcon icon={faWallet} className="text-brand text-lg" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-white">
              Wallet Login
            </h3>
            <p className="text-sm text-white/80">
              Connect your Web3 wallet
            </p>
          </div>
          <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 animate-fadeIn"
          onClick={closeModal}>
          <div className="bg-gradient-to-br from-white via-white to-gray-50 rounded-2xl shadow-2xl p-8 w-[420px] border border-gray-100 transition-all duration-300 scale-100 animate-slideIn" 
               onClick={(e) => e.stopPropagation()}>
            
            {/* Header with Close Button */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Choose Wallet</h2>
                <p className="text-gray-500 text-sm">Connect your preferred wallet to get started</p>
              </div>
              <button 
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
              >
                <svg className="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Wallet Options */}
            <div className="flex flex-col space-y-3">
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

            {/* Footer */}
            {/*<div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                By connecting a wallet, you agree to our Terms of Service
              </p>
            </div>*/}
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

  // Wallet icons mapping
  const getWalletIcon = (name) => {
    const walletName = name.toLowerCase();
    
    if (walletName.includes('metamask')) {
      return (
        <div className="size-12 bg-white rounded-lg flex items-center justify-center shadow-sm p-2">
          <Image
            src="/wallets/MetaMask.svg"
            alt="MetaMask"
            width={32}
            height={32}
            className="size-8"
          />
        </div>
      );
    } else if (walletName.includes('walletconnect')) {
      return (
        <div className="size-12 bg-white rounded-lg flex items-center justify-center shadow-sm p-2">
          <Image
            src="/wallets/WalletConnect.svg"
            alt="WalletConnect"
            width={32}
            height={32}
            className="size-8"
          />
        </div>
      );
    } else if (walletName.includes('solana') || walletName.includes('phantom')) {
      return (
        <div className="size-12 bg-white rounded-lg flex items-center justify-center shadow-sm p-2">
          <Image
            src="/wallets/Phantom.svg"
            alt="Phantom"
            width={32}
            height={32}
            className="size-8"
          />
        </div>
      );
    } else {
      // Default wallet icon usando colores del brand
      return (
        <div className="size-12 bg-gradient-to-br from-brand to-purple-700 rounded-lg flex items-center justify-center shadow-sm">
          <FontAwesomeIcon icon={faWallet} className="text-white text-lg" />
        </div>
      );
    }
  };

  const getWalletDescription = (name) => {
    const walletName = name.toLowerCase();
    if (walletName.includes('walletconnect')) return 'Mobile & hardware wallets';
    return 'Browser extension wallet';
  };

  return (
    <button 
      disabled={!ready} 
      onClick={onClick}
      className={`group w-full p-4 text-left rounded-xl border transition-all duration-300 hover:scale-[1.02] ${
        ready 
          ? 'bg-brand border-brand hover:bg-hover-dark hover:shadow-lg text-white' 
          : 'bg-gray-300 border-gray-300 text-gray-500 cursor-not-allowed opacity-50'
      }`}
    >
      <div className="flex items-center space-x-4">
        {getWalletIcon(connector.name)}
        <div className="flex-1">
          <h3 className={`font-semibold text-lg ${ready ? 'text-white' : 'text-gray-400'}`}>
            {connector.name}
          </h3>
          <p className={`text-sm ${ready ? 'text-white/80' : 'text-gray-400'}`}>
            {ready ? getWalletDescription(connector.name) : 'Not available'}
          </p>
        </div>
        {ready && (
          <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}

WalletLogin.propTypes = {
  setIsModalOpen: PropTypes.func.isRequired
}
