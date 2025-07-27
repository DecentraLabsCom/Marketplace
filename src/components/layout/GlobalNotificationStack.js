"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { useNotifications } from '@/context/NotificationContext'

/**
 * Global notification system for displaying user feedback messages
 * Manages toast-style notifications with auto-dismiss and manual close options
 * @returns {JSX.Element|null} Notification stack positioned in bottom-left corner, or null if no notifications
 */
export default function GlobalNotificationStack() {
  const { notifications, removeNotification } = useNotifications();

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="fixed z-50" style={{ bottom: '16px', left: '16px' }}>
      {notifications.map((notification, index) => (
        <div 
          key={notification.id}
          className={`mb-3 p-4 rounded-lg shadow-lg max-w-sm sm:max-w-md animate-slide-in ${
            notification.type === 'success' ? 'bg-[#7b976e]' : 
            notification.type === 'error' ? 'bg-[#a87583]' : 
            notification.type === 'warning' ? 'bg-[#bcc4fc]' : 
            notification.type === 'pending' ? 'bg-[#715c8c]' : 
            'bg-[#335763]'
          }`}
          style={{
            animationDelay: `${index * 100}ms`
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-white font-medium">{notification.message}</p>
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
