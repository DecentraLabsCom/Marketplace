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
 */
export default function AccessControl({
  children,
  message = "Please log in to access this page.",
  requireWallet = false,
  requireSSO = false,
}) {
  const { isLoggedIn, isSSO, isConnected, isLoading, isWalletLoading } = useUser();
  const router = useRouter();

  // Determine access status
  let hasAccess = false;
  if (requireWallet) {
    hasAccess = isConnected;
  } else if (requireSSO) {
    hasAccess = isSSO;
  } else {
    hasAccess = isLoggedIn;
  }

  // Handle redirect logic - must be called before any conditional returns
  useEffect(() => {
    // Only redirect after loading is complete and we know the real connection state
    if (!isLoading && !isWalletLoading && !hasAccess) {
      router.push('/');
    }
  }, [hasAccess, router, isLoading, isWalletLoading]);

  // Show loading state while wallet connection is being determined
  if (isWalletLoading || isLoading) {
    return (
      <Container padding="sm" className="text-white text-center">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full size-6 border-b-2 border-white"></div>
          <span>Connecting...</span>
        </div>
      </Container>
    );
  }

  if (!hasAccess) {
    return (
      <Container padding="sm" className="text-white text-center">
        {message}
      </Container>
    );
  }

  return children;
}

AccessControl.propTypes = {
  children: PropTypes.node.isRequired,
  message: PropTypes.string,
  requireWallet: PropTypes.bool,
  requireSSO: PropTypes.bool
}

AccessControl.defaultProps = {
  message: "Please log in to access this page.",
  requireWallet: false,
  requireSSO: false
}
