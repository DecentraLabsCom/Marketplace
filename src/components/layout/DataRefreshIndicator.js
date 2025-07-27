"use client";
import { useUser } from '@/context/UserContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { useState } from 'react';

export default function DataRefreshIndicator() {
    const { hasIncompleteData, isProviderLoading, refreshProviderStatus } = useUser();
    const [isRefreshing, setIsRefreshing] = useState(false);

    if (!hasIncompleteData || isProviderLoading) return null;

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshProviderStatus();
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-300 rounded-lg p-3 shadow-lg z-50 max-w-sm">
            <div className="flex items-center space-x-2">
                <FontAwesomeIcon 
                    icon={faExclamationTriangle} 
                    className="text-yellow-600 text-sm" 
                />
                <span className="text-sm text-yellow-800">
                    Provider data incomplete
                </span>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="text-yellow-700 hover:text-yellow-900 disabled:opacity-50"
                    title="Refresh provider data"
                >
                    <FontAwesomeIcon 
                        icon={faSync} 
                        className={`text-sm ${isRefreshing ? 'animate-spin' : ''}`} 
                    />
                </button>
            </div>
        </div>
    );
}
