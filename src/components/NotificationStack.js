import React from 'react';

export default function NotificationStack({ notifications, onRemove, className = '' }) {
  if (!notifications || notifications.length === 0) return null;

  return (
    <div className={`fixed z-50 ${className}`} style={{ top: '16px', right: '16px' }}>
      {notifications.map((notification, index) => (
        <div 
          key={notification.id}
          className={`mb-3 p-4 rounded-lg shadow-lg max-w-md animate-slide-in ${
            notification.type === 'success' ? 'bg-green-600' :
            notification.type === 'error' ? 'bg-red-600' :
            notification.type === 'warning' ? 'bg-yellow-600' :
            notification.type === 'pending' ? 'bg-blue-600' :
            'bg-gray-600'
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
            {onRemove && (
              <button 
                onClick={() => onRemove(notification.id)}
                className="ml-2 text-white hover:text-gray-300 transition-colors"
                aria-label="Close notification"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
