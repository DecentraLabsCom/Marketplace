"use client";
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars } from '@fortawesome/free-solid-svg-icons'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import Login from '@/components/auth/Login'
import { validateProviderRole, hasAdminRole } from '@/utils/auth/roleValidation'

/**
 * Main navigation bar component with responsive design and authentication-aware menu
 * Provides access to all major sections based on user role and authentication status
 * @returns {JSX.Element} Responsive navigation bar with logo, menu items, and user controls
 */
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    isLoggedIn,
    isProvider,
    isProviderLoading,
    isSSO,
    user,
    isInstitutionRegistered,
    isInstitutionRegistrationLoading,
    institutionRegistrationStatus,
  } = useUser();
  const isInstitutionRegistrationPending =
    isSSO && (isInstitutionRegistrationLoading || institutionRegistrationStatus == null);

  // More tolerant approach - show buttons if we're logged in, even if loading provider data
  const showMenuButtons = isLoggedIn;

  // Check if user has faculty role (professor)
  const isFaculty = () => {
    if (!isSSO || !user) return false;
    const userRole = (user.role || '').toLowerCase().trim();
    const userScopedRole = (user.scopedRole || '').toLowerCase().trim();
    return userRole.includes('faculty') || userScopedRole.includes('faculty');
  };

  // Check if user can see and access the registration option
  const showRegisterButton = () => {
    // Don't show if not logged in, already a provider, or currently loading provider status
    if (!isLoggedIn || isProvider || isProviderLoading) return false;
    
    // For wallet users, always show (they can register manually via form)
    if (!isSSO) return true;
    
    // For SSO users, only show if they have institutional admin-level role
    if (!user) return false;
    if (!hasAdminRole(user.role, user.scopedRole)) return false;
    if (isInstitutionRegistrationPending) return false;
    return !isInstitutionRegistered;
  };

  const isInstitutionAdmin =
    isSSO && user && hasAdminRole(user.role, user.scopedRole);

  // Check if user should see Lab Panel button
  const showProviderButton = () => {
    // Show if already a confirmed provider
    if (isProvider && !isProviderLoading) return true;
    // For SSO faculty users, show only if institution is already registered
    if (isSSO && !isInstitutionRegistrationPending && isFaculty() && isInstitutionRegistered) return true;
    return false;
  };

  const menuButton = (href, label) => (
    <Link href={href}
      className="bg-white shadow-md flex items-center hover:bg-hover-dark hover:text-white p-3"
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-header-bg text-hover-dark p-3 shadow-md">
      <Container className="flex justify-between items-center">
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
            {showRegisterButton() && menuButton("/register", isInstitutionAdmin ? "Register my Institution" : "Register as a Provider")}
            {showProviderButton() && menuButton("/providerdashboard", "Lab Panel")}
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
      </Container>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-header-bg text-hover-dark shadow-md absolute inset-x-0 z-50">
          <div className="flex flex-col items-center py-4 space-y-2">
            {showMenuButtons && (
              <>
                <Link href="/reservation" className="w-full pt-1 text-center font-bold hover:bg-hover-dark hover:text-white rounded">
                  Book a Lab
                </Link>
                <Link href="/userdashboard" className="w-full pt-1 text-center font-bold hover:bg-hover-dark hover:text-white rounded">
                  Dashboard
                </Link>
                {showRegisterButton() && (
                  <Link href="/register" className="w-full pt-1 text-center font-bold hover:bg-hover-dark hover:text-white rounded">
                    {isInstitutionAdmin ? "Register my Institution" : "Register as a Provider"}
                  </Link>
                )}
                {showProviderButton() && (
                  <Link href="/providerdashboard" className="w-full pt-1 text-center font-bold hover:bg-hover-dark hover:text-white rounded">
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

// Navbar component doesn't accept any props
Navbar.propTypes = {}
