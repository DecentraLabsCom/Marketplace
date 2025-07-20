"use client"
import { createContext, useContext, useState } from "react";
import { devLog } from '@/utils/logger';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);

    // Helper function to add notifications
    const addNotification = (type, message, options = {}) => {
        const notification = {
            id: Date.now() + Math.random(), // Ensure uniqueness
            type,
            message,
            timestamp: new Date(),
            autoHide: options.autoHide !== false,   // Default true
            duration: options.duration || 6000,     // Default 6 seconds
            hash: options.hash || null,
            ...options
        };
        
        setNotifications(prev => [...prev, notification]);
        
        // Auto-remove if autoHide is enabled
        if (notification.autoHide) {
            setTimeout(() => {
                removeNotification(notification.id);
            }, notification.duration);
        }
        
        return notification;
    };

    // Function to remove a specific notification
    const removeNotification = (notificationId) => {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
    };

    // Function to clear all notifications
    const clearAllNotifications = () => {
        setNotifications([]);
    };

    // Function to add temporary notification (like transaction status)
    const addTemporaryNotification = (type, message, hash = null) => {
        return addNotification(type, message, { hash, autoHide: true, duration: 5000 });
    };

    // Function to add persistent notification (like reservation results)
    const addPersistentNotification = (type, message, options = {}) => {
        return addNotification(type, message, { ...options, autoHide: true, duration: 10000 });
    };

    // Function to handle error messages with user-friendly formatting
    const addErrorNotification = (error, context = '') => {
        devLog.error(`Error in ${context}:`, error);
        
        let errorMessage = '❌ An error occurred';
        
        if (typeof error === 'string') {
            errorMessage = `❌ ${error}`;
        } else if (error?.message) {
            // Handle AbortController errors specifically
            if (error.name === 'AbortError' || error.message.includes('aborted')) {
                errorMessage = '⚠️ Request was cancelled due to timeout';
                return addTemporaryNotification('warning', errorMessage);
            }
            // Handle user rejection specifically
            else if (error.message.includes('User rejected') || 
                error.message.includes('User denied') ||
                error.message.includes('user rejected')) {
                errorMessage = '❌ Transaction cancelled by user';
            } else if (error.message.includes('insufficient funds')) {
                errorMessage = '❌ Insufficient funds for transaction';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = '❌ Network error. Please check your connection';
            } else if (error.message.includes('validation')) {
                errorMessage = '❌ Validation failed';
            } else {
                // For other errors, show a generic message but preserve context if provided
                errorMessage = context ? `❌ ${context} failed` : '❌ Operation failed';
            }
        }
        
        return addPersistentNotification('error', errorMessage);
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            addNotification,
            addTemporaryNotification,
            addPersistentNotification,
            addErrorNotification,
            removeNotification,
            clearAllNotifications
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
