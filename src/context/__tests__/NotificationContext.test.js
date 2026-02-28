/**
 * Unit Tests: NotificationContext
 *
 * Tests the notification management system including:
 * - Adding/removing notifications
 * - Auto-dismiss with timers
 * - Deduplication logic
 * - Priority sorting
 * - Category filtering
 * - Max notification limits
 * - Error handling
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '@/context/NotificationContext';

// Mock dependencies
jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/utils/optimizedContext', () => {
  const React = require('react');
  const mockContext = React.createContext();

  return {
    createOptimizedContext: (name) => ({
      Context: mockContext,
      Provider: ({ children, value }) => {
        return React.createElement(mockContext.Provider, { value }, children);
      }
    }),
    useMemoizedValue: (fn) => fn(),
  };
});

jest.mock('@/utils/errorBoundaries', () => ({
  ErrorBoundary: ({ children }) => children,
  useErrorHandler: () => ({ handleError: jest.fn() }),
  ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  ErrorCategory: { UI: 'UI', DATA: 'DATA', NETWORK: 'NETWORK' },
}));

describe('NotificationContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Basic Notification Operations', () => {
    test('adds a notification successfully', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Test notification');
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0]).toMatchObject({
        type: 'success',
        message: 'Test notification',
        autoHide: true,
        duration: 6000,
        priority: 'normal',
        category: 'general',
      });
      expect(result.current.notifications[0].id).toBeDefined();
      expect(result.current.notifications[0].timestamp).toBeInstanceOf(Date);
    });

    test('removes a notification by ID', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      let notificationId;
      act(() => {
        const notif = result.current.addNotification('info', 'Test');
        notificationId = notif.id;
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        result.current.removeNotification(notificationId);
      });

      expect(result.current.notifications).toHaveLength(0);
    });

    test('removes multiple notifications (batch)', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      const ids = [];
      act(() => {
        ids.push(result.current.addNotification('info', 'Notification 1').id);
        ids.push(result.current.addNotification('info', 'Notification 2').id);
        ids.push(result.current.addNotification('info', 'Notification 3').id);
      });

      expect(result.current.notifications).toHaveLength(3);

      act(() => {
        result.current.removeNotifications([ids[0], ids[2]]);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].message).toBe('Notification 2');
    });

    test('clears all notifications', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Test 1');
        result.current.addNotification('error', 'Test 2');
        result.current.addNotification('warning', 'Test 3');
      });

      expect(result.current.notifications).toHaveLength(3);

      act(() => {
        result.current.clearAllNotifications();
      });

      expect(result.current.notifications).toHaveLength(0);
    });
  });

  describe('Auto-dismiss Functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('auto-dismisses notification after duration', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Auto-hide test', {
          autoHide: true,
          duration: 3000,
        });
      });

      expect(result.current.notifications).toHaveLength(1);

      // Advance time to trigger auto-dismiss
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.notifications).toHaveLength(0);
    });

    test('does not auto-dismiss when autoHide is false', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('info', 'Persistent', {
          autoHide: false,
        });
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should still be there
      expect(result.current.notifications).toHaveLength(1);
    });

    test('addTemporaryNotification auto-dismisses after 5 seconds', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addTemporaryNotification('success', 'Temporary notification');
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.notifications).toHaveLength(0);
    });

    test('addPersistentNotification does not auto-dismiss by default', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addPersistentNotification('info', 'Persistent notification');
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0]).toMatchObject({
        type: 'info',
        message: 'Persistent notification',
        autoHide: false,
        category: 'persistent',
      });
    });

    test('cleans pending notification timers on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const { result, unmount } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Timer cleanup', {
          autoHide: true,
          duration: 10000,
          allowDuplicates: true,
        });
      });

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Deduplication Logic', () => {
    test('prevents duplicate notifications within 2 seconds', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Duplicate test');
      });

      // Try to add duplicate immediately (should be suppressed)
      act(() => {
        result.current.addNotification('success', 'Duplicate test'); // Should be suppressed
      });

      expect(result.current.notifications).toHaveLength(1);
    });

    test('deduplicates deterministically for rapid burst calls and returns existing notification', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      let first;
      let second;
      act(() => {
        first = result.current.addNotification('success', 'Burst duplicate');
        second = result.current.addNotification('success', 'Burst duplicate');
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(second.id).toBe(first.id);
    });

    test('allows re-adding same dedupeKey after notification removal', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      let first;
      act(() => {
        first = result.current.addTemporaryNotification('success', 'Confirmed!', null, { dedupeKey: 'rk:123' });
      });

      // Remove the notification and then re-add with same dedupeKey
      act(() => {
        result.current.removeNotification(first.id);
      });

      let second;
      act(() => {
        second = result.current.addTemporaryNotification('success', 'Confirmed!', null, { dedupeKey: 'rk:123' });
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(second.id).not.toBe(first.id);
    });

    test('allows duplicate if allowDuplicates option is true', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Duplicate test');
        result.current.addNotification('success', 'Duplicate test', {
          allowDuplicates: true,
        });
      });

      expect(result.current.notifications).toHaveLength(2);
    });

    test('allows same message after 2 seconds', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Test message');
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(2100); // Just over 2 seconds
      });

      act(() => {
        result.current.addNotification('success', 'Test message');
      });

      expect(result.current.notifications).toHaveLength(2);

      jest.useRealTimers();
    });

    test('suppresses duplicates by dedupeKey within custom window', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addTemporaryNotification(
          'success',
          '✅ Reservation confirmed!',
          null,
          { dedupeKey: 'reservation-confirmed:abc', dedupeWindowMs: 120000 }
        );
      });

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      act(() => {
        result.current.addTemporaryNotification(
          'success',
          '✅ Reservation confirmed!',
          null,
          { dedupeKey: 'reservation-confirmed:abc', dedupeWindowMs: 120000 }
        );
      });

      expect(result.current.notifications).toHaveLength(1);
      jest.useRealTimers();
    });

    test('allows notifications with different dedupeKey', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addTemporaryNotification(
          'success',
          '✅ Reservation confirmed!',
          null,
          { dedupeKey: 'reservation-confirmed:a', dedupeWindowMs: 120000 }
        );
        result.current.addTemporaryNotification(
          'success',
          '✅ Reservation confirmed!',
          null,
          { dedupeKey: 'reservation-confirmed:b', dedupeWindowMs: 120000 }
        );
      });

      expect(result.current.notifications).toHaveLength(2);
    });
  });

  describe('Priority Sorting', () => {
    test('sorts notifications by priority (critical > high > normal > low)', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('info', 'Low priority', { priority: 'low' });
        result.current.addNotification('error', 'High priority', { priority: 'high' });
        result.current.addNotification('info', 'Normal priority', { priority: 'normal' });
        result.current.addNotification('error', 'Critical priority', { priority: 'critical' });
      });

      expect(result.current.notifications).toHaveLength(4);
      expect(result.current.notifications[0].priority).toBe('critical');
      expect(result.current.notifications[1].priority).toBe('high');
      expect(result.current.notifications[2].priority).toBe('normal');
      expect(result.current.notifications[3].priority).toBe('low');
    });
  });

  describe('Max Notifications Limit', () => {
    test('limits notifications to 50 maximum', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.addNotification('info', `Notification ${i}`, {
            allowDuplicates: true,
          });
        }
      });

      expect(result.current.notifications).toHaveLength(50);
    });
  });

  describe('Category Management', () => {
    test('clears notifications by category', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'General 1', { category: 'general' });
        result.current.addNotification('error', 'Error 1', { category: 'error' });
        result.current.addNotification('success', 'General 2', { category: 'general' });
      });

      expect(result.current.notifications).toHaveLength(3);

      act(() => {
        result.current.clearAllNotifications('general');
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].category).toBe('error');
    });

    test('gets notifications by category', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Success 1', { category: 'success' });
        result.current.addNotification('error', 'Error 1', { category: 'error' });
        result.current.addNotification('success', 'Success 2', { category: 'success' });
      });

      const successNotifications = result.current.getNotificationsByCategory('success');
      expect(successNotifications).toHaveLength(2);
      expect(successNotifications.every(n => n.category === 'success')).toBe(true);
    });
  });

  describe('Notification Statistics', () => {
    test('returns correct notification statistics', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addNotification('success', 'Success 1', { priority: 'high' });
        result.current.addNotification('error', 'Error 1', { priority: 'critical' });
        result.current.addNotification('success', 'Success 2', { priority: 'normal' });
        result.current.addNotification('warning', 'Warning 1', { priority: 'normal' });
      });

      const stats = result.current.getNotificationStats();

      expect(stats.total).toBe(4);
      expect(stats.byType).toEqual({
        success: 2,
        error: 1,
        warning: 1,
      });
      expect(stats.byPriority).toEqual({
        high: 1,
        critical: 1,
        normal: 2,
      });
    });
  });

  describe('Specialized Notification Methods', () => {
    test('addSuccessNotification adds ✅ emoji', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addSuccessNotification('Operation successful');
      });

      expect(result.current.notifications[0].message).toBe('✅ Operation successful');
      expect(result.current.notifications[0].type).toBe('success');
      expect(result.current.notifications[0].category).toBe('success');
    });

    test('addWarningNotification adds ⚠️ emoji', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addWarningNotification('Warning message');
      });

      expect(result.current.notifications[0].message).toBe('⚠️ Warning message');
      expect(result.current.notifications[0].type).toBe('warning');
    });

    test('addInfoNotification adds ℹ️ emoji', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addInfoNotification('Info message');
      });

      expect(result.current.notifications[0].message).toBe('ℹ️ Info message');
      expect(result.current.notifications[0].type).toBe('info');
    });
  });

  describe('Error Notification Handling', () => {
    test('handles string errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification('Simple error message');
      });

      expect(result.current.notifications[0].message).toBe('❌ Simple error message');
      expect(result.current.notifications[0].type).toBe('error');
    });

    test('handles Error objects', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('Something went wrong'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Operation failed');
    });

    test('handles user rejection errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        const error = new Error('Transaction failed');
        error.shortMessage = 'User rejected transaction';
        result.current.addErrorNotification(error);
      });

      expect(result.current.notifications[0].message).toBe('🚫 Transaction rejected by user');
    });

    test('handles insufficient funds errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('insufficient funds'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Insufficient funds');
    });

    test('handles network errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('network error occurred'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Network error');
    });

    test('handles abort errors as warnings', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        const error = new Error('Request was aborted');
        error.name = 'AbortError';
        result.current.addErrorNotification(error);
      });

      expect(result.current.notifications[0].message).toBe('⚠️ Request cancelled');
      expect(result.current.notifications[0].type).toBe('warning');
    });
  });

  describe('Blockchain Error Classification', () => {
    test('classifies execution reverted errors via classifier', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('execution reverted: bad state'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Transaction reverted on-chain');
    });

    test('classifies INTENT_AUTH_CANCELLED error code', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        const error = new Error('Authorization cancelled by user');
        error.code = 'INTENT_AUTH_CANCELLED';
        result.current.addErrorNotification(error);
      });

      expect(result.current.notifications[0].message).toBe('🚫 Authorization cancelled');
    });

    test('classifies MetaMask 4001 user rejection via classifier', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        const error = new Error('MetaMask RPC Error');
        error.code = 4001;
        result.current.addErrorNotification(error);
      });

      expect(result.current.notifications[0].message).toBe('🚫 Transaction rejected by user');
    });

    test('classifies rate limit errors via classifier', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('rate limit exceeded'));
      });

      expect(result.current.notifications[0].message).toBe('⚠️ Too many requests — wait and retry');
    });

    test('classifies gas errors via classifier', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('gas required exceeds allowance'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Transaction requires too much gas');
    });

    test('uses EnhancedError userMessage when available', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        const error = new Error('internal details');
        error.userMessage = 'Blockchain transaction error';
        error.severity = 'high';
        result.current.addErrorNotification(error);
      });

      expect(result.current.notifications[0].message).toContain('Blockchain transaction error');
    });

    test('falls back to "Operation failed" for unclassified errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('some random unmatched error'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Operation failed');
    });

    test('user rejection via shortMessage still works with classifier integration', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        const error = new Error('Transaction failed');
        error.shortMessage = 'User rejected the request';
        result.current.addErrorNotification(error);
      });

      expect(result.current.notifications[0].message).toBe('🚫 Transaction rejected by user');
    });

    test('classifies failed-to-prepare reservation intent errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(
          new Error('Failed to prepare reservation intent: 500')
        );
      });

      expect(result.current.notifications[0].message).toBe('❌ Could not prepare reservation');
    });

    test('classifies nonce conflict errors', () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: NotificationProvider,
      });

      act(() => {
        result.current.addErrorNotification(new Error('nonce too low'));
      });

      expect(result.current.notifications[0].message).toBe('❌ Transaction conflict — try again');
    });
  });

  describe('Hook Usage Validation', () => {
    test('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useNotifications());
      }).toThrow('useNotifications must be used within a NotificationProvider');

      consoleSpy.mockRestore();
    });
  });
});
