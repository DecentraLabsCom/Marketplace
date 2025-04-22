import { createContext, useContext, useState, useEffect } from "react";
import { useAccount } from "wagmi";
import getConfig from 'next/config';

const UserContext = createContext();

export function UserProvider({ children }) {
    const { address, isConnected } = useAccount();
    const [isSSO, setIsSSO] = useState(false);
    const [user, setUser] = useState(null);
    const [isProvider, setIsPrivider] = useState(true);

    const { publicRuntimeConfig } = getConfig();
    const basePath = publicRuntimeConfig.basePath || '';

    // Check cookies for SSO session
    useEffect(() => {
        fetch(`${basePath}/api/auth/sso/session`)
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

    return (
        <UserContext.Provider value={{ address, isConnected, isSSO, user, isLoggedIn, isProvider }}>
        {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    return useContext(UserContext);
}