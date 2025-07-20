"use client";
import { useUser } from '@/context/UserContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
  const { isLoggedIn, isSSO, isConnected } = useUser();
  const router = useRouter();

  let hasAccess = false;
  if (requireWallet) {
    hasAccess = isConnected;
  } else if (requireSSO) {
    hasAccess = isSSO;
  } else {
    hasAccess = isLoggedIn;
  }

  useEffect(() => {
    if (!hasAccess) {
      router.push('/');
    }
  }, [hasAccess, router]);

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-4 text-white text-center">
        {message}
      </div>
    );
  }

  return children;
}
