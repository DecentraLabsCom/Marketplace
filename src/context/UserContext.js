"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { devLog } from '@/utils/logger';

const UserContext = createContext();

export function UserData({ children }) {
    const { address, isConnected } = useAccount();
    const [isSSO, setIsSSO] = useState(false);
    const [user, setUser] = useState(null);
    const [isProvider, setIsProvider] = useState(false);
    const [isProviderLoading, setIsProviderLoading] = useState(true);

    // Check cookies for SSO session
    useEffect(() => {
        fetch('/api/auth/sso/session', { method: 'GET' })
        .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch session");
            return res.json();
        })
        .then((data) => {
            if (data.user != null) {
                setIsSSO(true);
                setUser(data.user);
                setIsProviderLoading(false);
            }
        })
        .catch((error) => devLog.error("Error fetching session:", error));
    }, []);

    const isLoggedIn = isConnected || isSSO;

    useEffect(() => {
        if (isLoggedIn) {
            setIsProviderLoading(true);
            
            if (isSSO && user?.email) {
                // For SSO users, check provider status by email
                fetch('/api/contract/provider/isSSOProvider', {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email: user.email }),
                })
                .then((res) => res.json())
                .then((data) => {
                    setIsProvider(prev => prev !== data.isLabProvider ? data.isLabProvider : prev);
                })
                .catch((error) => devLog.error("Error checking SSO provider status:", error))
                .finally(() => setIsProviderLoading(false));
            } else if (address) {
                // For wallet users, check provider status by wallet address
                fetch('/api/contract/provider/isLabProvider', {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ wallet: address }),
                })
                .then((res) => res.json())
                .then((data) => {
                    setIsProvider(prev => prev !== data.isLabProvider ? data.isLabProvider : prev);
                })
                .catch((error) => devLog.error("Error checking wallet provider status:", error))
                .finally(() => setIsProviderLoading(false));

                // Get lab provider name and add the name of the provider to the user object
                fetch('/api/contract/provider/getLabProviderName', {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ wallet: address }),
                })
                .then((res) => {
                    if (!res.ok) {
                        if (res.status === 404) return { name: null };
                        throw new Error("Error fetching provider name");
                    }
                    return res.json();
                })
                .then((data) => {
                    setUser(prev => {
                        if ((!data.name && prev?.name) || 
                            (data.name && (!prev || prev.name !== data.name))) {
                            return { ...prev, name: data.name };
                        }
                        return prev;
                    });
                })
                .catch((error) => devLog.error("Error fetching provider name:", error));
            } else {
                setIsProviderLoading(false);
            }
        } else {
            setIsProviderLoading(false);
        }
    }, [isLoggedIn, address, user?.email, isSSO]);

    // Function to refresh provider status (useful for external updates)
    const refreshProviderStatus = () => {
        if (isLoggedIn) {
            setIsProviderLoading(true);
            
            if (isSSO && user?.email) {
                // For SSO users, check provider status by email
                fetch('/api/contract/provider/isSSOProvider', {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email: user.email }),
                })
                .then((res) => res.json())
                .then((data) => {
                    setIsProvider(data.isLabProvider);
                })
                .catch((error) => console.error("Error refreshing SSO provider status:", error))
                .finally(() => setIsProviderLoading(false));
            } else if (address) {
                // For wallet users, check provider status by wallet address
                fetch('/api/contract/provider/isLabProvider', {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ wallet: address }),
                })
                .then((res) => res.json())
                .then((data) => {
                    setIsProvider(data.isLabProvider);
                })
                .catch((error) => console.error("Error refreshing wallet provider status:", error))
                .finally(() => setIsProviderLoading(false));
            }
        }
    };

    return (
        <UserContext.Provider value={{
            address: address ?? null,
            isConnected: !!isConnected,
            isSSO,
            user,
            isLoggedIn: !!isConnected || isSSO,
            isProvider,
            isProviderLoading,
            refreshProviderStatus
        }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error("useUser must be used within a UserData provider");
    return ctx;
}