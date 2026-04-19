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
 * @param {boolean} [props.requireSSO]
 * @param {boolean} [props.requireProvider]
 */
export default function AccessControl({
  children,
  message = "Please log in to access this page.",
  requireSSO = false,
  requireProvider = false,
}) {
  const {
    isLoggedIn,
    isSSO,
    isLoading,
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

  const isFaculty = () => {
    if (!isSSO || !user) return false;
    const userRole = (user.role || '').toLowerCase().trim();
    const userScopedRole = (user.scopedRole || '').toLowerCase().trim();
    return userRole.includes('faculty') || userScopedRole.includes('faculty');
  };

  const canAccessProviderDashboard = () => {
    if (!isSSO) return false;
    if (isProvider && !isProviderLoading) return true;
    if (isInstitutionRegistrationPending) return false;
    return isFaculty() && isInstitutionRegistered;
  };

  let hasAccess = false;
  let accessMessage = message;

  if (requireProvider) {
    hasAccess = canAccessProviderDashboard();
    if (!hasAccess && !isLoading && !isProviderLoading) {
      if (!isSSO) {
        accessMessage = "Institutional login is required to access the Lab Panel.";
      } else if (!isFaculty()) {
        accessMessage = "Only faculty members can access the Lab Panel.";
      } else if (!isInstitutionRegistered) {
        accessMessage = "Your institution is not registered yet. Please register it first.";
      } else {
        accessMessage = "Only faculty members and confirmed providers can access the Lab Panel.";
      }
    }
  } else if (requireSSO) {
    hasAccess = isSSO;
  } else {
    hasAccess = isLoggedIn;
  }

  useEffect(() => {
    if (!isLoading && !isInstitutionRegistrationPending && !hasAccess) {
      router.push('/');
    }
  }, [hasAccess, router, isLoading, isInstitutionRegistrationPending]);

  if (isLoading || isInstitutionRegistrationPending) {
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
    if (requireProvider) {
      return (
        <Container padding="sm" className="text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-yellow-800 text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-yellow-600 mb-4">
              {accessMessage}
            </p>
          </div>
        </Container>
      );
    }

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
  requireSSO: PropTypes.bool,
  requireProvider: PropTypes.bool
}
