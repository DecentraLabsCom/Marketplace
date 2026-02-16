"use client";
import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'
import { useNotifications } from '@/context/NotificationContext'

/**
 * Maps notification types to their corresponding background color classes
 * All toasts use solid, dark backgrounds with white text for readability
 * @param {string} type - Notification type (success, error, warning, info, pending)
 * @returns {string} Tailwind background color class
 */
const getNotificationBgClass = (type) => {
  const bgMap = {
    'success': 'bg-success',      // Dark green
    'error': 'bg-error',          // Dark red
    'warning': 'bg-warning',      // Dark orange
    'info': 'bg-info',            // Dark blue
    'pending': 'bg-pending',      // Dark purple
  };
  
  // Default to info color if type is not recognized
  return bgMap[type] || 'bg-info';
};

/**
 * Global notification system for displaying user feedback messages
 * Manages toast-style notifications with auto-dismiss and manual close options
 * @returns {JSX.Element|null} Notification stack positioned in bottom-left corner, or null if no notifications
 */
export default function GlobalNotificationStack() {
  const { notifications, removeNotification } = useNotifications();

  if (!notifications || notifications.length === 0) return null;

  const sanitizeMessage = (message) =>
    String(message ?? '');

  return (
    <div className="fixed z-[60]" style={{ bottom: '16px', left: '16px' }}>
      {notifications.map((notification, index) => (
        <div 
          key={notification.id}
          className={`mb-3 p-4 rounded-lg shadow-lg max-w-sm sm:max-w-md animate-slide-in transition-transform duration-300 starting:opacity-0 starting:translate-y-2 opacity-100 translate-y-0 ${getNotificationBgClass(notification.type)}`}
          style={{
            animationDelay: `${index * 100}ms`
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-white font-medium">
                {notification.type === 'pending' && (
                  <FontAwesomeIcon icon={faSpinner} className="mr-2 animate-spin" />
                )}
                {sanitizeMessage(notification.message)}
              </p>
              {notification.hash && (
                <p className="text-gray-200 text-sm mt-1 break-all">
                  Hash: {notification.hash.slice(0, 10)}...{notification.hash.slice(-8)}
                </p>
              )}
              {notification.timestamp && (
                <p className="text-gray-200 text-xs mt-1">
                  {notification.timestamp.toLocaleTimeString()}
                </p>
              )}
            </div>
            <button 
              onClick={() => removeNotification(notification.id)}
              className="ml-2 text-white hover:text-gray-300 transition-colors"
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// GlobalNotificationStack component doesn't accept any props
GlobalNotificationStack.propTypes = {}
