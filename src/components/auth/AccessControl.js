"use client";
import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { useUser } from '@/context/UserContext'

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

  // Show loading state while wallet connection is being determined
  if (isWalletLoading || isLoading) {
    return (
      <div className="container mx-auto p-4 text-white text-center">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          <span>Connecting...</span>
        </div>
      </div>
    );
  }

  let hasAccess = false;
  if (requireWallet) {
    hasAccess = isConnected;
  } else if (requireSSO) {
    hasAccess = isSSO;
  } else {
    hasAccess = isLoggedIn;
  }

  useEffect(() => {
    // Only redirect after loading is complete and we know the real connection state
    if (!isLoading && !isWalletLoading && !hasAccess) {
      router.push('/');
    }
  }, [hasAccess, router, isLoading, isWalletLoading]);

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-4 text-white text-center">
        {message}
      </div>
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
