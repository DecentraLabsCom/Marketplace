import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/router';
import { Account } from '../utils/account';
import { WalletOptions } from '../utils/walletOptions';

export default function Login() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/sso/session")
      /*.then((res) => {
        if (!res.ok) throw new Error("Failed to fetch session");
        return res.json();
      })*/
      .then((data) => setUser(data.user))
      .catch((error) => console.error("Error fetching session:", error));
  }, []);

  const handleSSOLogin = () => {
    if (!process.env.NEXT_PUBLIC_SAML_IDP_LOGIN_URL) {
        console.error("SSO login URL is not configured.");
        return;
    }
    // Redirect to the SSO Identity Provider endpoint
    router.push(process.env.NEXT_PUBLIC_SAML_IDP_LOGIN_URL);
  };

  if (isConnected) return <Account />;
  if (user) return <div className="text-sm font-bold">{user.name}</div>;
  return (
    <div className="flex space-x-4">
      <WalletOptions />
      <button
        onClick={handleSSOLogin}
        className="bg-[#715c8c] text-white font-bold rounded-lg px-4 py-2 transition 
        duration-300 ease-in-out hover:bg-[#333f63] hover:text-white"
      >
        Institutional Login
      </button>
    </div>
  );
}