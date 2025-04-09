import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import Login from './Login';

export default function Navbar() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [provider, setProvider] = useState(false);
  const [user, setUser] = useState(null);
  const { isConnected } = useAccount();

  const menuButton = (href, label) => (
    <div className="bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white">
      <Link href={href} className="p-3">{label}</Link>
    </div>
  );

  // Listen for changes in isConnected
  useEffect(() => {
    if (!isConnected && !user) {
      // If user disconnects when on other pages, redirect to homepage
      if (router.pathname == '/userdashboard' || router.pathname == '/providerdashboard'
        || router.pathname == '/reservation' || router.pathname == '/register') {
        router.push('/');
      }
    } else {
      setProvider(true); // Only for testing purposes
    }
  }, [isConnected, user]);

  // Check cookies for SSO session
  useEffect(() => {
    setIsClient(true);
    fetch("/api/auth/sso/session")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch session");
        return res.json();
      })
      .then((data) => setUser(data.user))
      .catch((error) => console.error("Error fetching session:", error));
  }, []);

  return (
    <nav className="bg-[#caddff] text-[#333f63] p-3 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <div className="h-14 relative">
          <Image src="/DecentraLabs.png" alt="DecentraLabs Logo" fill priority sizes="80vw"
                      className="!relative" />
          </div>
        </Link>

        {/* Desktop Menu */}
        <div className="flex items-center space-x-6 ml-auto">
          <div className="hidden md:flex space-x-6 font-bold">
            {isClient && (isConnected || user) && (
            <>
              {menuButton("/reservation", "Book a Lab")}
              {menuButton("/userdashboard", "Dashboard")}
              {!provider && menuButton("/register", "Register as a Provider")}
              {provider && menuButton("/providerdashboard", "Lab Panel")}
            </>
            )}
          </div>
          <div className="h-8 border-l border-gray-600" />
          <div className="hidden md:block">
            {isClient && <Login isConnected={isConnected} user={user} />}
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
          <Link href="/userdashboard" className="block py-2">Dashboard</Link>
          <Link href="/about" className="block py-2">Lab Providers</Link>
          <div className="py-2">
            <Login isConnected={isConnected} user={user} />
          </div>
        </div>
      )}
    </nav>
  );
}