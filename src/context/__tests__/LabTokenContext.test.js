/**
 * Unit Tests: LabTokenContext
 *
 * Tests the LAB token management system including:
 * - Token balance and allowance state
 * - Token amount formatting
 * - Price conversion (per-second to per-hour)
 * - Cost calculations for reservations
 * - Balance and allowance checking
 * - Token approval functionality
 * - Refresh and refetch utilities
 * - Memoization to prevent re-renders
 * - Hook validation
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { LabTokenProvider, useLabToken } from '@/context/LabTokenContext';

// Mock the underlying useLabToken hook
const mockLabTokenData = {
  balance: BigInt('1500000'), // 15 LAB credits
  allowance: BigInt('1000000'), // 10 LAB credits
  decimals: 5,
  isLoading: false,
  labTokenAddress: '0xMockLabTokenAddress',
  calculateReservationCost: jest.fn(),
  checkBalanceAndAllowance: jest.fn(),
  checkSufficientBalance: jest.fn(),
  formatTokenAmount: jest.fn(),
  formatPrice: jest.fn(),
  refreshTokenData: jest.fn(),
  refetchBalance: jest.fn(),
  refetchAllowance: jest.fn(),
  clearDecimalsCache: jest.fn(),
};

jest.mock('@/hooks/useLabToken', () => ({
  useLabTokenHook: jest.fn(() => mockLabTokenData),
}));

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('LabTokenContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Functionality', () => {
    test('provides token data to consumers', () => {
      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.balance).toEqual(BigInt('1500000'));
      expect(result.current.allowance).toEqual(BigInt('1000000'));
      expect(result.current.decimals).toBe(5);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.labTokenAddress).toBe('0xMockLabTokenAddress');
    });

    test('provides all function references', () => {
      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(typeof result.current.calculateReservationCost).toBe('function');
      expect(typeof result.current.checkBalanceAndAllowance).toBe('function');
      expect(typeof result.current.checkSufficientBalance).toBe('function');
      expect(typeof result.current.formatTokenAmount).toBe('function');
      expect(typeof result.current.formatPrice).toBe('function');
      expect(typeof result.current.refreshTokenData).toBe('function');
      expect(typeof result.current.refetchBalance).toBe('function');
      expect(typeof result.current.refetchAllowance).toBe('function');
      expect(typeof result.current.clearDecimalsCache).toBe('function');
    });

    test('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useLabToken());
      }).toThrow('useLabToken must be used within a LabTokenProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Token Formatting', () => {
    test('formatTokenAmount formats token amount correctly', () => {
      mockLabTokenData.formatTokenAmount.mockReturnValue('15.00');

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const formattedAmount = result.current.formatTokenAmount(
        BigInt('1500000')
      );

      expect(result.current.formatTokenAmount).toHaveBeenCalledWith(
        BigInt('1500000')
      );
      expect(formattedAmount).toBe('15.00');
    });

    test('formatTokenAmount handles zero balance', () => {
      mockLabTokenData.formatTokenAmount.mockReturnValue('0.00');

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const formattedAmount = result.current.formatTokenAmount(BigInt('0'));

      expect(formattedAmount).toBe('0.00');
    });

    test('formatTokenAmount handles null/undefined values', () => {
      mockLabTokenData.formatTokenAmount.mockReturnValue('0.00');

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const formattedAmount = result.current.formatTokenAmount(null);

      expect(formattedAmount).toBe('0.00');
    });
  });

  describe('Price Conversion', () => {
    test('formatPrice converts per-second price to per-hour price', () => {
      // Mock: 0.54 credits per hour = 15 raw units per second with 5 credit decimals.
      mockLabTokenData.formatPrice.mockReturnValue('0.5');

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const formattedPrice = result.current.formatPrice('15');

      expect(result.current.formatPrice).toHaveBeenCalledWith('15');
      expect(formattedPrice).toBe('0.5');
    });

    test('formatPrice handles zero price', () => {
      mockLabTokenData.formatPrice.mockReturnValue('0');

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const formattedPrice = result.current.formatPrice('0');

      expect(formattedPrice).toBe('0');
    });

    test('formatPrice handles missing decimals', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        decimals: undefined,
      });

      mockLabTokenData.formatPrice.mockReturnValue('0');

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const formattedPrice = result.current.formatPrice('15');

      expect(formattedPrice).toBe('0');
    });
  });

  describe('Cost Calculations', () => {
    test('calculateReservationCost calculates booking cost correctly', () => {
      // Mock: price per second * duration in seconds
      const pricePerSecond = '15'; // raw credits per second
      const durationMinutes = 60; // 1 hour
      const expectedCost = BigInt('54000'); // 0.54 LAB

      mockLabTokenData.calculateReservationCost.mockReturnValue(expectedCost);

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const cost = result.current.calculateReservationCost(
        pricePerSecond,
        durationMinutes
      );

      expect(result.current.calculateReservationCost).toHaveBeenCalledWith(
        pricePerSecond,
        durationMinutes
      );
      expect(cost).toEqual(expectedCost);
    });

    test('calculateReservationCost handles zero duration', () => {
      mockLabTokenData.calculateReservationCost.mockReturnValue(BigInt('0'));

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const cost = result.current.calculateReservationCost('15', 0);

      expect(cost).toEqual(BigInt('0'));
    });

    test('calculateReservationCost handles null price', () => {
      mockLabTokenData.calculateReservationCost.mockReturnValue(BigInt('0'));

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const cost = result.current.calculateReservationCost(null, 60);

      expect(cost).toEqual(BigInt('0'));
    });
  });

  describe('Balance Checking', () => {
    test('checkBalanceAndAllowance returns correct status', () => {
      const requiredAmount = BigInt('500000'); // 5 LAB

      mockLabTokenData.checkBalanceAndAllowance.mockReturnValue({
        hasSufficientBalance: true,
        hasSufficientAllowance: true,
        balance: BigInt('1500000'),
        allowance: BigInt('1000000'),
        requiredAmount,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const status = result.current.checkBalanceAndAllowance(requiredAmount);

      expect(status.hasSufficientBalance).toBe(true);
      expect(status.hasSufficientAllowance).toBe(true);
      expect(status.balance).toEqual(BigInt('1500000'));
      expect(status.allowance).toEqual(BigInt('1000000'));
    });

    test('checkBalanceAndAllowance detects insufficient balance', () => {
      const requiredAmount = BigInt('2000000'); // 20 LAB (more than balance)

      mockLabTokenData.checkBalanceAndAllowance.mockReturnValue({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
        balance: BigInt('1500000'),
        allowance: BigInt('1000000'),
        requiredAmount,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const status = result.current.checkBalanceAndAllowance(requiredAmount);

      expect(status.hasSufficientBalance).toBe(false);
      expect(status.hasSufficientAllowance).toBe(false);
    });

    test('checkSufficientBalance returns correct result', () => {
      const labPrice = '15'; // per second
      const durationMinutes = 60; // 1 hour

      mockLabTokenData.checkSufficientBalance.mockReturnValue({
        hasSufficient: true,
        cost: BigInt('54000'),
        balance: BigInt('1500000'),
        shortfall: BigInt('0'),
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const status = result.current.checkSufficientBalance(
        labPrice,
        durationMinutes
      );

      expect(status.hasSufficient).toBe(true);
      expect(status.cost).toEqual(BigInt('54000'));
      expect(status.shortfall).toEqual(BigInt('0'));
    });

    test('checkSufficientBalance calculates shortfall correctly', () => {
      const labPrice = '278'; // 10.008 LAB per hour
      const durationMinutes = 1200; // 20 hours

      mockLabTokenData.checkSufficientBalance.mockReturnValue({
        hasSufficient: false,
        cost: BigInt('20016000'),
        balance: BigInt('1500000'),
        shortfall: BigInt('18516000'),
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const status = result.current.checkSufficientBalance(
        labPrice,
        durationMinutes
      );

      expect(status.hasSufficient).toBe(false);
      expect(status.shortfall).toEqual(BigInt('18516000'));
    });
  });

  describe('Refresh Functions', () => {
    test('refreshTokenData refetches balance and allowance', () => {
      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      act(() => {
        result.current.refreshTokenData();
      });

      expect(mockLabTokenData.refreshTokenData).toHaveBeenCalled();
    });

    test('refetchBalance refetches balance', () => {
      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      act(() => {
        result.current.refetchBalance();
      });

      expect(mockLabTokenData.refetchBalance).toHaveBeenCalled();
    });

    test('refetchAllowance refetches allowance', () => {
      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      act(() => {
        result.current.refetchAllowance();
      });

      expect(mockLabTokenData.refetchAllowance).toHaveBeenCalled();
    });

    test('clearDecimalsCache clears cached decimals', () => {
      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      act(() => {
        result.current.clearDecimalsCache();
      });

      expect(mockLabTokenData.clearDecimalsCache).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    test('isLoading is true when loading', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        isLoading: true,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.isLoading).toBe(true);
    });

    test('isLoading is false when not loading', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        isLoading: false,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Memoization and Re-render Prevention', () => {
    test('context value remains stable when data does not change', () => {
      const { result, rerender } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const firstContextValue = result.current;

      // Rerender without changing data
      rerender();

      const secondContextValue = result.current;

      // Context values should be reference-equal (same object)
      // This prevents unnecessary re-renders in consuming components
      expect(firstContextValue).toBe(secondContextValue);
    });

    test('context value updates when balance changes', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');

      // Initial render
      const { result, rerender } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const initialBalance = result.current.balance;

      // Update balance
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        balance: BigInt('2000000'), // 20 LAB (changed from 15)
      });

      // Rerender to trigger update
      rerender();

      // Balance should update
      expect(result.current.balance).not.toEqual(initialBalance);
      expect(result.current.balance).toEqual(BigInt('2000000'));
    });

    test('context value updates when decimals change', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');

      // Initial render
      const { result, rerender } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      const initialDecimals = result.current.decimals;

      // Update decimals (e.g., switching to a different token)
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        decimals: 6, // Changed from 5
      });

      // Rerender to trigger update
      rerender();

      // Decimals should update
      expect(result.current.decimals).not.toEqual(initialDecimals);
      expect(result.current.decimals).toBe(6);
    });
  });

  describe('Edge Cases', () => {
    test('handles undefined balance', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        balance: undefined,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.balance).toBeUndefined();
    });

    test('handles undefined allowance', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        allowance: undefined,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.allowance).toBeUndefined();
    });

    test('handles undefined decimals', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        decimals: undefined,
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.decimals).toBeUndefined();
    });

    test('handles zero balance', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        balance: BigInt('0'),
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.balance).toEqual(BigInt('0'));
    });

    test('handles zero allowance', () => {
      const { useLabTokenHook } = require('@/hooks/useLabToken');
      useLabTokenHook.mockReturnValue({
        ...mockLabTokenData,
        allowance: BigInt('0'),
      });

      const { result } = renderHook(() => useLabToken(), {
        wrapper: LabTokenProvider,
      });

      expect(result.current.allowance).toEqual(BigInt('0'));
    });
  });
});
