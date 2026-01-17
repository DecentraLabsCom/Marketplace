/**
 * Unit Tests: OptimisticUIContext
 *
 * Tests the optimistic UI state management including:
 * - Provider functionality and hook validation
 * - Listing state management (set/complete/clear)
 * - General lab state management
 * - Effective state calculation (optimistic overrides server state)
 * - Auto-cleanup of stale states
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { OptimisticUIProvider, useOptimisticUI } from '@/context/OptimisticUIContext';

// Mock logger
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

describe('OptimisticUIContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Provider Functionality', () => {
    test('renders and provides context without errors', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      expect(result.current).toBeDefined();
    });

    test('provides all required methods', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      // Listing-specific methods
      expect(result.current.setOptimisticListingState).toBeDefined();
      expect(result.current.completeOptimisticListingState).toBeDefined();
      expect(result.current.clearOptimisticListingState).toBeDefined();
      expect(result.current.getEffectiveListingState).toBeDefined();

      // General lab state methods
      expect(result.current.setOptimisticLabState).toBeDefined();
      expect(result.current.clearOptimisticLabState).toBeDefined();
      expect(result.current.getEffectiveLabState).toBeDefined();

      // Direct state access
      expect(result.current.labListingStates).toBeDefined();
      expect(result.current.labStates).toBeDefined();
    });

    test('throws error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useOptimisticUI());
      }).toThrow('useOptimisticUI must be used within an OptimisticUIProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Listing State Management', () => {
    test('sets optimistic listing state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();
      expect(result.current.labListingStates[labId].isListed).toBe(true);
      expect(result.current.labListingStates[labId].isPending).toBe(true);
      expect(result.current.labListingStates[labId].operation).toBe('listing');
      expect(result.current.labListingStates[labId].timestamp).toBeDefined();
    });

    test('sets optimistic unlisting state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, false, true);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();
      expect(result.current.labListingStates[labId].isListed).toBe(false);
      expect(result.current.labListingStates[labId].isPending).toBe(true);
      expect(result.current.labListingStates[labId].operation).toBe('unlisting');
    });

    test('completes optimistic listing state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      // First set the optimistic state
      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
      });

      expect(result.current.labListingStates[labId].isPending).toBe(true);

      // Then complete it
      act(() => {
        result.current.completeOptimisticListingState(labId);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();
      expect(result.current.labListingStates[labId].isListed).toBe(true);
      expect(result.current.labListingStates[labId].isPending).toBe(false);
      expect(result.current.labListingStates[labId].operation).toBe('listing');
    });

    test('completes non-existent state gracefully', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '999';

      // Try to complete state that doesn't exist
      act(() => {
        result.current.completeOptimisticListingState(labId);
      });

      // Should not crash or add any state
      expect(result.current.labListingStates[labId]).toBeUndefined();
    });

    test('clears optimistic listing state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      // First set the optimistic state
      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();

      // Then clear it
      act(() => {
        result.current.clearOptimisticListingState(labId);
      });

      expect(result.current.labListingStates[labId]).toBeUndefined();
    });

    test('handles multiple labs independently', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      act(() => {
        result.current.setOptimisticListingState('1', true, true);
        result.current.setOptimisticListingState('2', false, true);
        result.current.setOptimisticListingState('3', true, false);
      });

      expect(result.current.labListingStates['1'].isListed).toBe(true);
      expect(result.current.labListingStates['1'].isPending).toBe(true);
      expect(result.current.labListingStates['2'].isListed).toBe(false);
      expect(result.current.labListingStates['2'].isPending).toBe(true);
      expect(result.current.labListingStates['3'].isListed).toBe(true);
      expect(result.current.labListingStates['3'].isPending).toBe(false);
    });
  });

  describe('Effective Listing State', () => {
    test('returns server state when no optimistic state exists', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const effectiveState = result.current.getEffectiveListingState('1', true);

      expect(effectiveState.isListed).toBe(true);
      expect(effectiveState.isPending).toBe(false);
      expect(effectiveState.operation).toBe(null);
    });

    test('returns false for server state when undefined', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const effectiveState = result.current.getEffectiveListingState('1', undefined);

      expect(effectiveState.isListed).toBe(false);
      expect(effectiveState.isPending).toBe(false);
      expect(effectiveState.operation).toBe(null);
    });

    test('returns optimistic state when it exists', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
      });

      // Server says false, but optimistic says true
      const effectiveState = result.current.getEffectiveListingState(labId, false);

      expect(effectiveState.isListed).toBe(true);
      expect(effectiveState.isPending).toBe(true);
      expect(effectiveState.operation).toBe('listing');
    });

    test('optimistic state overrides server state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      // Set optimistic unlisting (lab is listed on server, but we're unlisting)
      act(() => {
        result.current.setOptimisticListingState(labId, false, true);
      });

      const effectiveState = result.current.getEffectiveListingState(labId, true);

      expect(effectiveState.isListed).toBe(false);
      expect(effectiveState.isPending).toBe(true);
      expect(effectiveState.operation).toBe('unlisting');
    });

    test('completed optimistic state still overrides server', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
        result.current.completeOptimisticListingState(labId);
      });

      const effectiveState = result.current.getEffectiveListingState(labId, false);

      expect(effectiveState.isListed).toBe(true);
      expect(effectiveState.isPending).toBe(false);
      expect(effectiveState.operation).toBe('listing');
    });
  });

  describe('General Lab State Management', () => {
    test('sets optimistic booking state', () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper: OptimisticUIProvider });
      const bookingId = 'rk-1';

      act(() => {
        result.current.setOptimisticBookingState(bookingId, { status: 'requesting', isPending: true });
      });

      expect(result.current.bookingStates[bookingId]).toBeDefined();
      expect(result.current.bookingStates[bookingId].status).toBe('requesting');
      expect(result.current.bookingStates[bookingId].isPending).toBe(true);
      expect(result.current.bookingStates[bookingId].timestamp).toBeDefined();
    });

    test('completes optimistic booking state', () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper: OptimisticUIProvider });
      const bookingId = 'rk-2';

      act(() => {
        result.current.setOptimisticBookingState(bookingId, { status: 'requesting', isPending: true });
      });

      expect(result.current.bookingStates[bookingId].isPending).toBe(true);

      act(() => {
        result.current.completeOptimisticBookingState(bookingId);
      });

      expect(result.current.bookingStates[bookingId].isPending).toBe(false);
    });

    test('clears optimistic booking state', () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper: OptimisticUIProvider });
      const bookingId = 'rk-3';

      act(() => {
        result.current.setOptimisticBookingState(bookingId, { status: 'requesting', isPending: true });
      });

      expect(result.current.bookingStates[bookingId]).toBeDefined();

      act(() => {
        result.current.clearOptimisticBookingState(bookingId);
      });

      expect(result.current.bookingStates[bookingId]).toBeUndefined();
    });

    test('getEffectiveBookingState merges server and optimistic state', () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper: OptimisticUIProvider });
      const bookingId = 'rk-4';
      const server = { status: 'pending', extra: 'srv' };

      act(() => {
        result.current.setOptimisticBookingState(bookingId, { status: 'requesting' });
      });

      const effective = result.current.getEffectiveBookingState(bookingId, server);
      expect(effective.status).toBe('requesting');
      expect(effective.extra).toBe('srv');
    });
  
  
    test('sets optimistic lab state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';
      const state = { name: 'Updated Lab', price: 100 };

      act(() => {
        result.current.setOptimisticLabState(labId, state);
      });

      expect(result.current.labStates[labId]).toBeDefined();
      expect(result.current.labStates[labId].name).toBe('Updated Lab');
      expect(result.current.labStates[labId].price).toBe(100);
      expect(result.current.labStates[labId].timestamp).toBeDefined();
    });

    test('merges optimistic lab state updates', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticLabState(labId, { name: 'Lab 1' });
      });

      act(() => {
        result.current.setOptimisticLabState(labId, { price: 200 });
      });

      expect(result.current.labStates[labId].name).toBe('Lab 1');
      expect(result.current.labStates[labId].price).toBe(200);
    });

    test('clears optimistic lab state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticLabState(labId, { name: 'Lab 1' });
      });

      expect(result.current.labStates[labId]).toBeDefined();

      act(() => {
        result.current.clearOptimisticLabState(labId);
      });

      expect(result.current.labStates[labId]).toBeUndefined();
    });
  });

  describe('Effective Lab State', () => {
    test('returns server state when no optimistic state exists', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const serverState = { name: 'Server Lab', price: 50 };
      const effectiveState = result.current.getEffectiveLabState('1', serverState);

      expect(effectiveState).toEqual(serverState);
    });

    test('merges optimistic state over server state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';
      const serverState = { name: 'Server Lab', price: 50, description: 'Server desc' };

      act(() => {
        result.current.setOptimisticLabState(labId, { price: 100 });
      });

      const effectiveState = result.current.getEffectiveLabState(labId, serverState);

      expect(effectiveState.name).toBe('Server Lab');
      expect(effectiveState.price).toBe(100); // Optimistic value
      expect(effectiveState.description).toBe('Server desc');
    });

    test('handles empty server state', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticLabState(labId, { price: 100 });
      });

      const effectiveState = result.current.getEffectiveLabState(labId);

      expect(effectiveState.price).toBe(100);
    });
  });

  describe('Auto-Cleanup', () => {
    test('cleans up pending states after 2 minutes', async () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();

      // Fast forward 2 minutes + cleanup interval
      act(() => {
        jest.advanceTimersByTime(2 * 60 * 1000 + 10000);
      });

      expect(result.current.labListingStates[labId]).toBeUndefined();
    });

    test('cleans up completed states after 15 minutes', async () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
        result.current.completeOptimisticListingState(labId);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();
      expect(result.current.labListingStates[labId].isPending).toBe(false);

      // Fast forward 10 minutes - should still exist
      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000 + 10000);
      });

      expect(result.current.labListingStates[labId]).toBeDefined();

      // Fast forward another 6 minutes - should be cleaned
      act(() => {
        jest.advanceTimersByTime(6 * 60 * 1000);
      });

      expect(result.current.labListingStates[labId]).toBeUndefined();
    });

    test('cleans up general lab states after timeout', async () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticLabState(labId, { name: 'Test', isPending: true });
      });

      expect(result.current.labStates[labId]).toBeDefined();

      // Fast forward 2 minutes + cleanup interval
      act(() => {
        jest.advanceTimersByTime(2 * 60 * 1000 + 10000);
      });

      expect(result.current.labStates[labId]).toBeUndefined();
    });

    test('keeps recent states during cleanup', async () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      act(() => {
        result.current.setOptimisticListingState('1', true, true);
        result.current.setOptimisticListingState('2', false, true);
      });

      // Fast forward 1 minute - both should still exist
      act(() => {
        jest.advanceTimersByTime(1 * 60 * 1000 + 10000);
      });

      expect(result.current.labListingStates['1']).toBeDefined();
      expect(result.current.labListingStates['2']).toBeDefined();
    });

    test('cleanup interval runs periodically', async () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
      });

      // Fast forward past expiry time + cleanup interval to ensure cleanup runs
      act(() => {
        jest.advanceTimersByTime(2 * 60 * 1000 + 15000);
      });

      // State should be cleaned up
      expect(result.current.labListingStates[labId]).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('handles numeric and string labIds consistently', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      act(() => {
        result.current.setOptimisticListingState(1, true, true);
        result.current.setOptimisticListingState('2', false, true);
      });

      expect(result.current.labListingStates[1]).toBeDefined();
      expect(result.current.labListingStates['2']).toBeDefined();
      expect(result.current.labListingStates[1].isListed).toBe(true);
      expect(result.current.labListingStates['2'].isListed).toBe(false);
    });

    test('handles rapid state changes', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.setOptimisticListingState(labId, true, true);
        result.current.setOptimisticListingState(labId, false, true);
        result.current.setOptimisticListingState(labId, true, false);
      });

      // Latest state should win
      expect(result.current.labListingStates[labId].isListed).toBe(true);
      expect(result.current.labListingStates[labId].isPending).toBe(false);
      expect(result.current.labListingStates[labId].operation).toBe('listing');
    });

    test('clearing already cleared state does nothing', () => {
      const { result } = renderHook(() => useOptimisticUI(), {
        wrapper: OptimisticUIProvider,
      });

      const labId = '1';

      act(() => {
        result.current.clearOptimisticListingState(labId);
        result.current.clearOptimisticLabState(labId);
      });

      // Should not crash or cause issues
      expect(result.current.labListingStates[labId]).toBeUndefined();
      expect(result.current.labStates[labId]).toBeUndefined();
    });
  });
});
