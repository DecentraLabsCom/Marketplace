"use client";
import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { useUser } from '@/context/UserContext'
import { Container } from '../ui/Layout'

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.message]
 * @param {boolean} [props.requireWallet]
 * @param {boolean} [props.requireSSO]
 * @param {boolean} [props.requireProvider]
 */
export default function AccessControl({
  children,
  message = "Please log in to access this page.",
  requireWallet = false,
  requireSSO = false,
  requireProvider = false,
}) {
  const {
    isLoggedIn,
    isSSO,
    isConnected,
    isLoading,
    isWalletLoading,
    address,
    user,
    isProvider,
    isProviderLoading,
    isInstitutionRegistered,
    isInstitutionRegistrationLoading,
    institutionRegistrationStatus,
  } = useUser();
  const router = useRouter();
  const isInstitutionRegistrationPending =
    isSSO && (isInstitutionRegistrationLoading || institutionRegistrationStatus == null);

  // Check if user has faculty role (professor)
  const isFaculty = () => {
    if (!isSSO || !user) return false;
    const userRole = (user.role || '').toLowerCase().trim();
    const userScopedRole = (user.scopedRole || '').toLowerCase().trim();
    return userRole.includes('faculty') || userScopedRole.includes('faculty');
  };

  // Check if user can access Provider Dashboard
  const canAccessProviderDashboard = () => {
    // Wallet users need to be confirmed providers
    if (!isSSO && address) {
      return isProvider && !isProviderLoading;
    }
    
    // SSO users: confirmed providers OR faculty members with registered institution
    if (isSSO) {
      if (isProvider && !isProviderLoading) return true;
      if (isInstitutionRegistrationPending) return false;
      return isFaculty() && isInstitutionRegistered;
    }
    
    return false;
  };

  // Determine access status
  let hasAccess = false;
  let accessMessage = message;
  
  if (requireProvider) {
    hasAccess = canAccessProviderDashboard();
    if (!hasAccess && !isLoading && !isProviderLoading) {
      if (isSSO) {
        if (!isFaculty()) {
          accessMessage = "Only faculty members can access the Lab Panel.";
        } else if (!isInstitutionRegistered) {
          accessMessage = "Your institution is not registered yet. Please register it first.";
        } else {
          accessMessage = "Only faculty members and confirmed providers can access the Lab Panel.";
        }
      } else {
        accessMessage = "Only confirmed providers can access the Lab Panel. Please register as a provider first.";
      }
    }
  } else if (requireWallet) {
    hasAccess = isConnected;
  } else if (requireSSO) {
    hasAccess = isSSO;
  } else {
    hasAccess = isLoggedIn;
  }

  // Handle redirect logic - must be called before any conditional returns
  useEffect(() => {
    // Only redirect after loading is complete and we know the real connection state
    if (!isLoading && !isWalletLoading && !isInstitutionRegistrationPending && !hasAccess) {
      router.push('/');
    }
  }, [hasAccess, router, isLoading, isWalletLoading, isInstitutionRegistrationPending]);

  // Show loading state while wallet connection is being determined
  if (isWalletLoading || isLoading || isInstitutionRegistrationPending) {
    return (
      <Container padding="sm" className="text-white text-center mt-6">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full size-6 border-b-2 border-white"></div>
          <span>Connecting...</span>
        </div>
      </Container>
    );
  }

  if (!hasAccess) {
    // Special handling for provider access
    if (requireProvider) {
      return (
        <Container padding="sm" className="text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-yellow-800 text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-yellow-600 mb-4">
              {accessMessage}
            </p>
            {!isSSO && (
              <button 
                onClick={() => router.push('/register')}
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors"
              >
                Register as Provider
              </button>
            )}
          </div>
        </Container>
      );
    }
    
    // Standard access denied message
    return (
      <Container padding="sm" className="text-white text-center mt-6">
        {accessMessage}
      </Container>
    );
  }

  return children;
}

AccessControl.propTypes = {
  children: PropTypes.node.isRequired,
  message: PropTypes.string,
  requireWallet: PropTypes.bool,
  requireSSO: PropTypes.bool,
  requireProvider: PropTypes.bool
}
