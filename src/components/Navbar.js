import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import Login from './Login';
import { appendPath } from '../utils/pathUtils';
import { useRouter } from 'next/router';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const router = useRouter();
  const { isConnected } = useAccount();
  const [showUserDashboard, setShowUserDashboard] = useState(false);
  const [showProviderDashboard, setShowProviderDashboard] = useState(false);
  // For tests -> replace for real isProvider check
  const isProvider = true;

    // Added useEffect to listen for changes in isConnected
    useEffect(() => {
      if (!isConnected) {
        setShowUserDashboard(false);
        setShowProviderDashboard(false);
        // If user disconnects when on dashboard or providers page redirect to homepage
        if (router.pathname == '/dashboard' || router.pathname == '/providers') {
          router.push('/');
        }
      } else {
        setShowUserDashboard(true);
        if (isProvider) {
          setShowProviderDashboard(true);
        } else {
          setShowProviderDashboard(false);
        }
      }
    }, [isConnected]);

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
              <Link href="/LabReservationPage" className="font-bold p-3">Book a Lab</Link>
            </div>
            <div className={`bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white 
            ${showUserDashboard ? '' : 'hidden'}`}>
              <Link href="/UserDashboardPage" className="font-bold p-3">Dashboard</Link>
            </div>
            {/* Only show if user is a lab provider */}
            <div className={`bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white "
            ${showProviderDashboard ? '' : 'hidden'}`}>
              <Link href="/ProviderDashboardPage" className="font-bold p-3">Lab Management</Link>
            </div>
            <div className="bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white ">
              <Link href="/registration" className="font-bold p-3">Register as a Provider</Link>
            </div>
            
          </div>
          <div className="h-8 border-l border-gray-600"></div>
          <div className="hidden md:block">
            {isClient && <Login />}
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
            {isClient && <Login />}
          </div>
        </div>
      )}
    </nav>
  );
}