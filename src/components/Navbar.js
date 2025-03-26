import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { Account } from '../utils/account';
import { WalletOptions } from '../utils/wallet-options';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { appendPath } from '../utils/pathUtils';
import { useRouter } from 'next/router';

function ConnectWallet() {
  const { isConnected } = useAccount();
  if (isConnected) return <Account />;
  return <WalletOptions />;
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { isConnected } = useAccount();
  // Create constant to hide dashboard if not connected
  const [notShowing, setNotShow] = useState(false);
  const [showProviderDiv, setShowProviderDiv] = useState(false);
  const router = useRouter();
  // For tests -> replace for real isProvider check
  const isProvider = true;

    // Added useEffect to listen for changes in isConnected
    useEffect(() => {
      if (!isConnected) {
        setNotShow(true); // Hide
        setShowProviderDiv(false);
        // If user disconnects when on dashboard or providers page redirect to homepage
        if (router.pathname == '/dashboard' || router.pathname == '/providers') {
          router.push('/');
        }
      } else {
        setNotShow(false); // Show
        if (isConnected && isProvider) {
          setShowProviderDiv(true);
        } else {
          setShowProviderDiv(false);
        }
      }
    }, [isConnected]); // useEffect will activate every time isConnected's state changes

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <nav className="bg-[#caddff] text-[#333f63] p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <img src={appendPath + "/DecentraLabs.png"} alt="DecentraLabs Logo" className="h-14" />
        </Link>

        {/* Desktop Menu */}
        <div className="flex items-center space-x-6 ml-auto">
          <div className="hidden md:flex space-x-6 font-bold ">
            <div className="bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white ">
              <Link href="/" className="font-bold p-3">Marketplace</Link>
            </div>
            <div className={`bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white 
            ${notShowing ? 'hidden' : ''}`}>
              <Link href="/dashboard" className="font-bold p-3">Dashboard</Link>
            </div>
            {/* Only show if user is provider */}
            {showProviderDiv && (
              <div className="bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white ">
                <Link href="/providers" className="font-bold p-3">Lab Providers</Link>
              </div>
            )}
          </div>
          <div className="h-8 border-l border-gray-600"></div>
          <div className="hidden md:block">
            {isClient && <ConnectWallet />}
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          <FontAwesomeIcon icon={faBars} />
        </button>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-[#333f63] text-center py-2">
          <Link href="/" className="block py-2">Marketplace</Link>
          <Link href="/dashboard" className="block py-2">Dashboard</Link>
          <Link href="/about" className="block py-2">Lab Providers</Link>
          <div className="py-2">
            {isClient && <ConnectWallet />}
          </div>
        </div>
      )}
    </nav>
  );
}