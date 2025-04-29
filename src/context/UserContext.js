import { createContext, useContext, useState, useEffect } from "react";
import { useAccount } from "wagmi";
//import getConfig from "next/config";

const UserContext = createContext();

export function UserData({ children }) {
    const { address, isConnected } = useAccount();
    const [isSSO, setIsSSO] = useState(false);
    const [user, setUser] = useState(null);
    const [isProvider, setIsProvider] = useState(false);
    const [isProviderLoading, setIsProviderLoading] = useState(true);

    //const { publicRuntimeConfig } = getConfig();
    //const basePath = publicRuntimeConfig.basePath || '';

    // Check cookies for SSO session
    useEffect(() => {
        fetch('/api/auth/sso/session')
        .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch session");
            return res.json();
        })
        .then((data) => {
            if (data.user != null) setIsSSO(true); 
            setUser(data.user);
        })
        .catch((error) => console.error("Error fetching session:", error));
    }, []);

    const isLoggedIn = isConnected || isSSO;

    useEffect(() => {
        if (isLoggedIn && address) {
            setIsProviderLoading(true);
            // Check if user is a provider by calling the contract
            fetch('/api/contract/provider/isLabProvider', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ wallet: address }),
            })
            .then((res) => res.json())
            .then((data) => setIsProvider(data.isLabProvider))
            .catch((error) => console.error("Error checking provider status:", error))
            .finally(() => setIsProviderLoading(false));

            // Get lab provider name and add the name of the provider to the user object
            fetch('/api/contract/provider/getLabProviderName', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ wallet: address }),
            })
            .then((res) => res.json())
            .then((data) => {
                if (data.name) {
                    setUser(prev => prev ? { ...prev, providerName: data.name } : { providerName: data.name });
                }
            })
            .catch((error) => console.error("Error fetching provider name:", error));
        }
    }, [isLoggedIn, address]);

    return (
        <UserContext.Provider value={{ address, isConnected, isSSO, user, isLoggedIn, isProvider, isProviderLoading }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error("useUser must be used within a UserData provider");
    return ctx;
}