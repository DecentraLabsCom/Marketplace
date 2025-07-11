"use client"
import { createContext, useContext, useState } from "react";

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

    return (
        <NotificationContext.Provider value={{
            notifications,
            addNotification,
            addTemporaryNotification,
            addPersistentNotification,
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
