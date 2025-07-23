"use client";
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { useUser } from '@/context/UserContext';
import Login from '@/components/Login';
import { validateProviderRole } from '@/utils/roleValidation';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isLoggedIn, isProvider, isProviderLoading, isSSO, user } = useUser();

  // More tolerant approach - show buttons if we're logged in, even if loading provider data
  const showMenuButtons = isLoggedIn;
  
  // Only hide provider-specific buttons if we're still determining provider status
  const showProviderButton = isProvider && !isProviderLoading;

  // Check if user can see and access the "Register as Provider" option
  const showRegisterButton = () => {
    // Don't show if not logged in or already a provider
    if (!isLoggedIn || isProvider) return false;
    
    // For wallet users, always show (they can register manually via form)
    if (!isSSO) return true;
    
    // For SSO users, only show if they have valid SAML2 role
    if (!user) return false;
    const roleValidation = validateProviderRole(user.role, user.scopedRole);
    return roleValidation.isValid;
  };

  const menuButton = (href, label) => (
    <Link href={href}
      className="bg-white shadow-md flex items-center hover:bg-[#333f63] hover:text-white p-3"
    >
      {label}
    </Link>
  );

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
          {showMenuButtons && (
          <div className="hidden md:flex space-x-6 font-bold">
            {menuButton("/reservation", "Book a Lab")}
            {menuButton("/userdashboard", "Dashboard")}
            {showRegisterButton() && menuButton("/register", "Register as a Provider")}
            {showProviderButton && menuButton("/providerdashboard", "Lab Panel")}
          </div>
          )}
          <div className="hidden md:block">
            <div className="h-8 border-l border-gray-600" />
          </div>
          <div className="hidden md:block">
            {<Login />}
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          <FontAwesomeIcon icon={faBars} />
        </button>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-[#caddff] text-[#333f63] shadow-md absolute inset-x-0 z-50">
          <div className="flex flex-col items-center py-4 space-y-2">
            {showMenuButtons && (
              <>
                <Link href="/reservation" className="w-full pt-1 text-center font-bold hover:bg-[#333f63] hover:text-white rounded">
                  Book a Lab
                </Link>
                <Link href="/userdashboard" className="w-full pt-1 text-center font-bold hover:bg-[#333f63] hover:text-white rounded">
                  Dashboard
                </Link>
                {showRegisterButton() && (
                  <Link href="/register" className="w-full pt-1 text-center font-bold hover:bg-[#333f63] hover:text-white rounded">
                    Register as a Provider
                  </Link>
                )}
                {showProviderButton && (
                  <Link href="/providerdashboard" className="w-full pt-1 text-center font-bold hover:bg-[#333f63] hover:text-white rounded">
                    Lab Panel
                  </Link>
                )}
              </>
            )}
            <div className="w-full flex justify-end items-center pt-2 px-2 border-t border-gray-300">
              <div className="flex items-center">
                <div className="h-8 border-l border-gray-600 mr-2" />
                <Login />
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
