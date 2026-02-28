"use client";
import { useContext, useState, useCallback, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import devLog from '@/utils/dev/logger'
import { createOptimizedContext, useMemoizedValue } from '@/utils/optimizedContext'
import { 
  ErrorBoundary, 
  useErrorHandler, 
  ErrorSeverity,
  ErrorCategory 
} from '@/utils/errorBoundaries'
import { classifyBlockchainError } from '@/utils/blockchain/classifyBlockchainError'

// Create optimized context
const { Context: NotificationContext, Provider: OptimizedNotificationProvider } = createOptimizedContext('NotificationContext');

/**
 * Core notification provider component with state management
 * Manages notification queue, auto-removal, and user interactions
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with notification context
 * @returns {JSX.Element} Provider with notification management functionality
 */
function NotificationProviderCore({ children }) {
    const [notifications, setNotifications] = useState([]);
    const { handleError } = useErrorHandler();
    const notificationTimeoutsRef = useRef(new Map());
    const dedupeRegistryRef = useRef(new Map());
    const notificationIdToDedupeKeysRef = useRef(new Map());
    const isMountedRef = useRef(true);

    // Optimized notification ID generation with collision avoidance
    const generateNotificationId = useCallback(() => {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }, []);

    // Optimized removeNotification with batching
    const removeNotification = useCallback((notificationId) => {
        const timeoutId = notificationTimeoutsRef.current.get(notificationId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            notificationTimeoutsRef.current.delete(notificationId);
        }
        // Efficiently remove dedupe entries for this notification using inverse map
        const keysSet = notificationIdToDedupeKeysRef.current.get(notificationId);
        if (keysSet) {
            for (const key of keysSet) {
                dedupeRegistryRef.current.delete(key);
            }
            notificationIdToDedupeKeysRef.current.delete(notificationId);
        }

        setNotifications(prev => {
            const filtered = prev.filter(n => n.id !== notificationId);
            if (filtered.length !== prev.length) {
                devLog.log('NotificationContext: Removed notification', { id: notificationId });
            }
            return filtered;
        });
    }, []);

    // Enhanced addNotification with better deduplication
    const addNotification = useCallback((type, message, options = {}) => {
        try {
            const dedupeWindowMs = Number(options.dedupeWindowMs) > 0
                ? Number(options.dedupeWindowMs)
                : 2000;
            const dedupeKey = options.dedupeKey ? String(options.dedupeKey) : null;
            const dedupeIdentifier = dedupeKey
                ? `key:${dedupeKey}`
                : `msg:${type}:${message}`;
            const notification = {
                id: generateNotificationId(),
                type,
                message,
                timestamp: new Date(),
                autoHide: options.autoHide !== false,   // Default true
                duration: options.duration || 6000,     // Default 6 seconds
                hash: options.hash || null,
                dedupeKey,
                priority: options.priority || 'normal', // low, normal, high, critical
                category: options.category || 'general',
                ...options
            };
            let addedNotification = notification;
            const now = Date.now();
            const cachedDuplicate = dedupeRegistryRef.current.get(dedupeIdentifier);
            const hasFreshCachedDuplicate = Boolean(
                cachedDuplicate &&
                now - cachedDuplicate.timestamp < dedupeWindowMs
            );

            if (hasFreshCachedDuplicate && !options.allowDuplicates) {
                devLog.log('NotificationContext: Duplicate notification suppressed (cache-fast-path)', { type, message });
                return cachedDuplicate.notification;
            }

            // Register early so burst calls in the same tick can dedupe deterministically.
            if (!options.allowDuplicates) {
                dedupeRegistryRef.current.set(dedupeIdentifier, { notification, timestamp: now });
            }

            setNotifications(prev => {
                const now = Date.now();

                if (hasFreshCachedDuplicate && !options.allowDuplicates) {
                    addedNotification = cachedDuplicate.notification;
                    devLog.log('NotificationContext: Duplicate notification suppressed (cache)', { type, message });
                    return prev;
                }

                const duplicate = prev.find(notif => 
                    now - notif.timestamp.getTime() < dedupeWindowMs && (
                        (dedupeKey && notif.dedupeKey === dedupeKey) ||
                        (!dedupeKey && notif.message === message && notif.type === type)
                    )
                );

                if (duplicate && !options.allowDuplicates) {
                    addedNotification = duplicate;
                    dedupeRegistryRef.current.set(dedupeIdentifier, { notification: duplicate, timestamp: now });
                    // Track inverse mapping for efficient cleanup
                    const setForDuplicate = notificationIdToDedupeKeysRef.current.get(duplicate.id) || new Set();
                    setForDuplicate.add(dedupeIdentifier);
                    notificationIdToDedupeKeysRef.current.set(duplicate.id, setForDuplicate);
                    devLog.log('NotificationContext: Duplicate notification suppressed', { type, message });
                    return prev;
                }

                // Limit total notifications to prevent memory issues
                const maxNotifications = 50;
                let newNotifications = [...prev, notification];
                
                // Sort by priority and timestamp
                newNotifications.sort((a, b) => {
                    const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
                    const priorityDiff = (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
                    if (priorityDiff !== 0) return priorityDiff;
                    return b.timestamp.getTime() - a.timestamp.getTime();
                });
                
                // Trim to max notifications
                if (newNotifications.length > maxNotifications) {
                    newNotifications = newNotifications.slice(0, maxNotifications);
                }

                dedupeRegistryRef.current.set(dedupeIdentifier, { notification, timestamp: now });
                // Track inverse mapping for efficient cleanup
                const idSet = notificationIdToDedupeKeysRef.current.get(notification.id) || new Set();
                idSet.add(dedupeIdentifier);
                notificationIdToDedupeKeysRef.current.set(notification.id, idSet);
                
                return newNotifications; 
            });

            // Auto-remove only when a new notification has been added
            if (addedNotification?.id === notification.id && notification.autoHide) {
                const timeoutId = setTimeout(() => {
                    if (!isMountedRef.current) return;
                    removeNotification(notification.id);
                }, notification.duration);
                notificationTimeoutsRef.current.set(notification.id, timeoutId);
            }
            
            devLog.log('NotificationContext: Added notification', { 
                id: addedNotification?.id, 
                type, 
                message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
            });
            
            return addedNotification;
        } catch (error) {
            handleError(error, {
                context: 'addNotification',
                severity: ErrorSeverity.LOW,
                category: ErrorCategory.UI
            });
            return null;
        }
    }, [removeNotification, generateNotificationId, handleError]);

    // Batch remove multiple notifications
    const removeNotifications = useCallback((notificationIds) => {
        notificationIds.forEach((notificationId) => {
            const timeoutId = notificationTimeoutsRef.current.get(notificationId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                notificationTimeoutsRef.current.delete(notificationId);
            }
            // Efficient removal using inverse mapping
            const keysSet = notificationIdToDedupeKeysRef.current.get(notificationId);
            if (keysSet) {
                for (const key of keysSet) {
                    dedupeRegistryRef.current.delete(key);
                }
                notificationIdToDedupeKeysRef.current.delete(notificationId);
            }
        });

        setNotifications(prev => {
            const filtered = prev.filter(n => !notificationIds.includes(n.id));
            devLog.log('NotificationContext: Batch removed notifications', { 
                count: prev.length - filtered.length,
                ids: notificationIds 
            });
            return filtered;
        });
    }, []);

    // Enhanced clearAllNotifications with category filtering
    const clearAllNotifications = useCallback((category = null) => {
        setNotifications(prev => {
            if (category) {
                const filtered = prev.filter(n => n.category !== category);
                prev.forEach((notification) => {
                    if (notification.category !== category) return;
                    const timeoutId = notificationTimeoutsRef.current.get(notification.id);
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        notificationTimeoutsRef.current.delete(notification.id);
                    }
                    // Use inverse mapping to clear dedupe entries
                    const keysSet = notificationIdToDedupeKeysRef.current.get(notification.id);
                    if (keysSet) {
                        for (const key of keysSet) {
                            dedupeRegistryRef.current.delete(key);
                        }
                        notificationIdToDedupeKeysRef.current.delete(notification.id);
                    }
                });
                devLog.log('NotificationContext: Cleared notifications by category', { category, count: prev.length - filtered.length });
                return filtered;
            } else {
                notificationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
                notificationTimeoutsRef.current.clear();
                dedupeRegistryRef.current.clear();
                devLog.log('NotificationContext: Cleared all notifications', { count: prev.length });
                return [];
            }
        });
    }, []);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            notificationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
            notificationTimeoutsRef.current.clear();
            dedupeRegistryRef.current.clear();
        };
    }, []);

    /**
     * Notification conventions:
     * - category: grouping key for selective cleanup and UI filtering.
     * - priority: visual ordering (critical > high > normal > low).
     * - dedupeKey: stable key for deterministic dedupe during rapid bursts.
     * Usage guidance:
     * - addTemporaryNotification: transient status/feedback expected to disappear.
     * - addPersistentNotification: actionable or long-lived state; does not auto-hide unless overridden.
     */
    // Enhanced temporary notification with smart deduplication
    const addTemporaryNotification = useCallback((type, message, hash = null, options = {}) => {
        return addNotification(type, message, { 
            hash, 
            autoHide: true, 
            duration: 5000,
            category: 'temporary',
            priority: 'normal',
            ...options 
        });
    }, [addNotification]);

    // Enhanced persistent notification
    const addPersistentNotification = useCallback((type, message, options = {}) => {
        return addNotification(type, message, { 
            autoHide: false,
            duration: 10000,
            category: 'persistent',
            priority: 'high',
            ...options 
        });
    }, [addNotification]);

    // Smart error notification with enhanced error categorization and concise messages
    const addErrorNotification = useCallback((error, context = '', options = {}) => {
        try {
            devLog.error(`Error in ${context}:`, error);
            
            let errorMessage = '❌ An error occurred';
            let priority = 'high';
            let duration = 6000;
            
            if (typeof error === 'string') {
                errorMessage = `❌ ${error}`;
            } else if (error?.message || error?.shortMessage || error?.userMessage) {
                // Handle AbortController errors specifically
                const message = error.message || '';
                const shortMessage = error.shortMessage || '';
                if (error.name === 'AbortError' || message.includes('aborted')) {
                    errorMessage = '⚠️ Request cancelled';
                    priority = 'normal';
                    duration = 4000;
                    return addTemporaryNotification('warning', errorMessage, null, { priority, duration });
                }

                // Handle user rejection specifically (wallet UX — keep above classifier)
                if (
                    shortMessage.toLowerCase().includes('user rejected') ||
                    shortMessage.toLowerCase().includes('user denied') ||
                    message.toLowerCase().includes('user rejected') ||
                    message.toLowerCase().includes('user denied')
                ) {
                    errorMessage = '🚫 Transaction rejected by user';
                    priority = 'normal';
                    duration = 3500;
                }
                // Blockchain / intent / wallet error classifier (specific messages)
                else {
                    const classified = classifyBlockchainError(error);
                    if (classified) {
                        errorMessage = classified.message;
                        priority = classified.priority;
                        duration = classified.duration;
                    }
                    // Legacy string-matching fallbacks for non-blockchain errors
                    else if (message.includes('insufficient funds')) {
                        errorMessage = '❌ Insufficient funds';
                        priority = 'high';
                        duration = 6000;
                    } else if (message.includes('network') || message.includes('fetch')) {
                        errorMessage = '❌ Network error';
                        priority = 'high';
                        duration = 6000;
                    } else if (message.includes('validation')) {
                        errorMessage = '❌ Validation failed';
                        priority = 'normal';
                        duration = 4000;
                    } else if (message.includes('timeout')) {
                        errorMessage = '⚠️ Request timeout';
                        priority = 'normal';
                        duration = 5000;
                    } else {
                        errorMessage = '❌ Operation failed';
                        priority = 'high';
                        duration = 5000;
                    }
                }
            }
            
            return addNotification('error', errorMessage, {
                autoHide: true,
                duration,
                priority,
                category: 'error',
                context,
                originalError: error,
                ...options
            });
        } catch (notificationError) {
            handleError(notificationError, {
                context: 'addErrorNotification',
                severity: ErrorSeverity.LOW,
                category: ErrorCategory.UI
            });
            // Fallback notification
            return addNotification('error', '❌ An unexpected error occurred', {
                autoHide: true,
                duration: 5000,
                category: 'error'
            });
        }
    }, [addNotification, addTemporaryNotification, handleError]);

    // Success notification with celebration
    const addSuccessNotification = useCallback((message, options = {}) => {
        return addNotification('success', `✅ ${message}`, {
            autoHide: true,
            duration: 6000,
            priority: 'normal',
            category: 'success',
            ...options
        });
    }, [addNotification]);

    // Warning notification
    const addWarningNotification = useCallback((message, options = {}) => {
        return addNotification('warning', `⚠️ ${message}`, {
            autoHide: true,
            duration: 7000,
            priority: 'normal',
            category: 'warning',
            ...options
        });
    }, [addNotification]);

    // Info notification
    const addInfoNotification = useCallback((message, options = {}) => {
        return addNotification('info', `ℹ️ ${message}`, {
            autoHide: true,
            duration: 5000,
            priority: 'low',
            category: 'info',
            ...options
        });
    }, [addNotification]);

    // Get notifications by category
    const getNotificationsByCategory = useCallback((category) => {
        return notifications.filter(n => n.category === category);
    }, [notifications]);

    // Get notification statistics
    const getNotificationStats = useCallback(() => {
        const stats = {
            total: notifications.length,
            byType: {},
            byCategory: {},
            byPriority: {}
        };

        notifications.forEach(notif => {
            // By type
            stats.byType[notif.type] = (stats.byType[notif.type] || 0) + 1;
            
            // By category
            stats.byCategory[notif.category] = (stats.byCategory[notif.category] || 0) + 1;
            
            // By priority
            stats.byPriority[notif.priority] = (stats.byPriority[notif.priority] || 0) + 1;
        });

        return stats;
    }, [notifications]);

    // Memoized context value
    const contextValue = useMemoizedValue(() => ({
        notifications,
        addNotification,
        addTemporaryNotification,
        addPersistentNotification,
        addErrorNotification,
        addSuccessNotification,
        addWarningNotification,
        addInfoNotification,
        removeNotification,
        removeNotifications,
        clearAllNotifications,
        getNotificationsByCategory,
        getNotificationStats
    }), [
        notifications,
        addNotification,
        addTemporaryNotification,
        addPersistentNotification,
        addErrorNotification,
        addSuccessNotification,
        addWarningNotification,
        addInfoNotification,
        removeNotification,
        removeNotifications,
        clearAllNotifications,
        getNotificationsByCategory,
        getNotificationStats
    ]);

    return (
        <OptimizedNotificationProvider value={contextValue}>
            {children}
        </OptimizedNotificationProvider>
    );
}

/**
 * Notification provider with error boundary
 * Main export for notification context with error handling wrapper
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to wrap with notification context
 * @returns {JSX.Element} Notification context provider wrapped with error boundary
 */
export function NotificationProvider({ children }) {
    return (
        <ErrorBoundary
            name="NotificationProvider"
            severity={ErrorSeverity.MEDIUM}
            category={ErrorCategory.UI}
            userMessage="Notification system error. Some notifications may not appear."
            recoverable={true}
            fallback={() => (
                <div className="fixed top-4 right-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                    <p className="text-yellow-800">Notification system temporarily unavailable</p>
                </div>
            )}
        >
            <NotificationProviderCore>{children}</NotificationProviderCore>
        </ErrorBoundary>
    );
}

/**
 * Hook to access notification context
 * Provides notification management functions for displaying user messages
 * @returns {Object} Notification context functions and state
 * @returns {Array} returns.notifications - Current notifications array
 * @returns {Function} returns.addNotification - Function to add new notifications
 * @returns {Function} returns.removeNotification - Function to remove notifications
 * @returns {Function} returns.clearAllNotifications - Function to clear all notifications
 * @throws {Error} When used outside of NotificationProvider
 */
export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}

// PropTypes
NotificationProviderCore.propTypes = {
    children: PropTypes.node.isRequired
}

NotificationProvider.propTypes = {
    children: PropTypes.node.isRequired
}
