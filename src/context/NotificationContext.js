"use client";
import { useContext, useState, useCallback } from 'react'
import devLog from '@/utils/dev/logger'
import { createOptimizedContext, useMemoizedValue } from '@/utils/optimizedContext'
import { 
  ErrorBoundary, 
  useErrorHandler, 
  ErrorSeverity,
  ErrorCategory 
} from '@/utils/errorBoundaries'

// Create optimized context
const { Context: NotificationContext, Provider: OptimizedNotificationProvider } = createOptimizedContext('NotificationContext');

function NotificationProviderCore({ children }) {
    const [notifications, setNotifications] = useState([]);
    const { handleError } = useErrorHandler();

    // Optimized notification ID generation with collision avoidance
    const generateNotificationId = useCallback(() => {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }, []);

    // Optimized removeNotification with batching
    const removeNotification = useCallback((notificationId) => {
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
            // Check for duplicate notifications by message content
            const isDuplicate = notifications.some(notif => 
                notif.message === message && 
                notif.type === type && 
                Date.now() - notif.timestamp.getTime() < 2000 // Within 2 seconds
            );

            if (isDuplicate && !options.allowDuplicates) {
                devLog.log('NotificationContext: Duplicate notification suppressed', { type, message });
                return null;
            }

            const notification = {
                id: generateNotificationId(),
                type,
                message,
                timestamp: new Date(),
                autoHide: options.autoHide !== false,   // Default true
                duration: options.duration || 6000,     // Default 6 seconds
                hash: options.hash || null,
                priority: options.priority || 'normal', // low, normal, high, critical
                category: options.category || 'general',
                ...options
            };
            
            setNotifications(prev => {
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
                
                return newNotifications;
            });
            
            // Auto-remove if autoHide is enabled
            if (notification.autoHide) {
                setTimeout(() => {
                    removeNotification(notification.id);
                }, notification.duration);
            }
            
            devLog.log('NotificationContext: Added notification', { 
                id: notification.id, 
                type, 
                message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
            });
            
            return notification;
        } catch (error) {
            handleError(error, {
                context: 'addNotification',
                severity: ErrorSeverity.LOW,
                category: ErrorCategory.UI
            });
            return null;
        }
    }, [notifications, removeNotification,generateNotificationId, handleError]);

    // Batch remove multiple notifications
    const removeNotifications = useCallback((notificationIds) => {
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
                devLog.log('NotificationContext: Cleared notifications by category', { category, count: prev.length - filtered.length });
                return filtered;
            } else {
                devLog.log('NotificationContext: Cleared all notifications', { count: prev.length });
                return [];
            }
        });
    }, []);

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
            autoHide: true, 
            duration: 10000,
            category: 'persistent',
            priority: 'high',
            ...options 
        });
    }, [addNotification]);

    // Smart error notification with enhanced error categorization
    const addErrorNotification = useCallback((error, context = '', options = {}) => {
        try {
            devLog.error(`Error in ${context}:`, error);
            
            let errorMessage = '❌ An error occurred';
            let priority = 'high';
            let duration = 8000;
            
            if (typeof error === 'string') {
                errorMessage = `❌ ${error}`;
            } else if (error?.message) {
                // Handle AbortController errors specifically
                if (error.name === 'AbortError' || error.message.includes('aborted')) {
                    errorMessage = '⚠️ Request was cancelled due to timeout';
                    priority = 'normal';
                    duration = 5000;
                    return addTemporaryNotification('warning', errorMessage, null, { priority, duration });
                }
                // Handle user rejection specifically
                else if (error.message.includes('User rejected') || 
                    error.message.includes('User denied') ||
                    error.message.includes('user rejected')) {
                    errorMessage = '❌ Transaction cancelled by user';
                    priority = 'normal';
                    duration = 6000;
                } else if (error.message.includes('insufficient funds')) {
                    errorMessage = '❌ Insufficient funds for transaction';
                    priority = 'high';
                    duration = 10000;
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMessage = '❌ Network error. Please check your connection';
                    priority = 'high';
                    duration = 8000;
                } else if (error.message.includes('validation')) {
                    errorMessage = '❌ Validation failed';
                    priority = 'normal';
                    duration = 6000;
                } else if (error.message.includes('timeout')) {
                    errorMessage = '⚠️ Request timed out. Please try again';
                    priority = 'normal';
                    duration = 7000;
                } else {
                    // For other errors, show a generic message but preserve context if provided
                    errorMessage = context ? `❌ ${context} failed` : '❌ Operation failed';
                    priority = 'high';
                    duration = 8000;
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

// Wrap with Error Boundary
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

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
