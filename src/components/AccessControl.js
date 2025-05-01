"use client";
import { useUser } from '../context/UserContext';
import { useRouter } from 'next/navigation'
import { useEffect } from 'react';

export default function RequireLogin({ children, message = "Please log in to access this page." }) {
  const { isLoggedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  if (!isLoggedIn) {
    return (
      <div className="container mx-auto p-4 text-white text-center">
        {message}
      </div>
    );
  }

  return children;
}