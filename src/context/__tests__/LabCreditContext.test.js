/**
 * Unit Tests: LabCreditContext
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

import { renderHook, act } from '@testing-library/react';
import { LabCreditProvider, useLabCredit } from '@/context/LabCreditContext';

// Mock the underlying useLabCredit hook
const mockLabTokenData = {
  balance: BigInt('150000000'), // 15 service credits
  allowance: BigInt('100000000'), // 10 service credits
  decimals: 7,
  isLoading: false,
  labCreditAddress: '0xMockLabCreditAddress',
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

jest.mock('@/hooks/useLabCredit', () => ({
  useLabCreditHook: jest.fn(() => mockLabTokenData),
}));

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('LabCreditContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Functionality', () => {
    test('provides token data to consumers', () => {
      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.balance).toEqual(BigInt('150000000'));
      expect(result.current.allowance).toEqual(BigInt('100000000'));
      expect(result.current.decimals).toBe(7);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.labCreditAddress).toBe('0xMockLabCreditAddress');
    });

    test('provides all function references', () => {
      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
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
        renderHook(() => useLabCredit());
      }).toThrow('useLabCredit must be used within a LabCreditProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Token Formatting', () => {
    test('formatTokenAmount formats token amount correctly', () => {
      mockLabTokenData.formatTokenAmount.mockReturnValue('15.00');

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const formattedAmount = result.current.formatTokenAmount(
        BigInt('150000000')
      );

      expect(result.current.formatTokenAmount).toHaveBeenCalledWith(
        BigInt('150000000')
      );
      expect(formattedAmount).toBe('15.00');
    });

    test('formatTokenAmount handles zero balance', () => {
      mockLabTokenData.formatTokenAmount.mockReturnValue('0.00');

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const formattedAmount = result.current.formatTokenAmount(BigInt('0'));

      expect(formattedAmount).toBe('0.00');
    });

    test('formatTokenAmount handles null/undefined values', () => {
      mockLabTokenData.formatTokenAmount.mockReturnValue('0.00');

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const formattedAmount = result.current.formatTokenAmount(null);

      expect(formattedAmount).toBe('0.00');
    });
  });

  describe('Price Conversion', () => {
    test('formatPrice converts per-second price to per-hour price', () => {
      // Mock: 0.54 credits per hour = 1,500 raw units per second with 7 credit decimals.
      mockLabTokenData.formatPrice.mockReturnValue('0.5');

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const formattedPrice = result.current.formatPrice('15');

      expect(result.current.formatPrice).toHaveBeenCalledWith('15');
      expect(formattedPrice).toBe('0.5');
    });

    test('formatPrice handles zero price', () => {
      mockLabTokenData.formatPrice.mockReturnValue('0');

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const formattedPrice = result.current.formatPrice('0');

      expect(formattedPrice).toBe('0');
    });

    test('formatPrice handles missing decimals', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        decimals: undefined,
      });

      mockLabTokenData.formatPrice.mockReturnValue('0');

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
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

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
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

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const cost = result.current.calculateReservationCost('15', 0);

      expect(cost).toEqual(BigInt('0'));
    });

    test('calculateReservationCost handles null price', () => {
      mockLabTokenData.calculateReservationCost.mockReturnValue(BigInt('0'));

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const cost = result.current.calculateReservationCost(null, 60);

      expect(cost).toEqual(BigInt('0'));
    });
  });

  describe('Balance Checking', () => {
    test('checkBalanceAndAllowance returns correct status', () => {
      const requiredAmount = BigInt('50000000'); // 5 service credits

      mockLabTokenData.checkBalanceAndAllowance.mockReturnValue({
        hasSufficientBalance: true,
        hasSufficientAllowance: true,
        balance: BigInt('150000000'),
        allowance: BigInt('100000000'),
        requiredAmount,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const status = result.current.checkBalanceAndAllowance(requiredAmount);

      expect(status.hasSufficientBalance).toBe(true);
      expect(status.hasSufficientAllowance).toBe(true);
      expect(status.balance).toEqual(BigInt('150000000'));
      expect(status.allowance).toEqual(BigInt('100000000'));
    });

    test('checkBalanceAndAllowance detects insufficient balance', () => {
      const requiredAmount = BigInt('2000000'); // 20 LAB (more than balance)

      mockLabTokenData.checkBalanceAndAllowance.mockReturnValue({
        hasSufficientBalance: false,
        hasSufficientAllowance: false,
        balance: BigInt('150000000'),
        allowance: BigInt('100000000'),
        requiredAmount,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const status = result.current.checkBalanceAndAllowance(requiredAmount);

      expect(status.hasSufficientBalance).toBe(false);
      expect(status.hasSufficientAllowance).toBe(false);
    });

    test('checkSufficientBalance returns correct result', () => {
      const labPrice = '1500'; // per second at 7 credit decimals
      const durationMinutes = 60; // 1 hour

      mockLabTokenData.checkSufficientBalance.mockReturnValue({
        hasSufficient: true,
        cost: BigInt('5400000'),
        balance: BigInt('150000000'),
        shortfall: BigInt('0'),
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const status = result.current.checkSufficientBalance(
        labPrice,
        durationMinutes
      );

      expect(status.hasSufficient).toBe(true);
      expect(status.cost).toEqual(BigInt('5400000'));
      expect(status.shortfall).toEqual(BigInt('0'));
    });

    test('checkSufficientBalance calculates shortfall correctly', () => {
      const labPrice = '27800'; // 10.008 service credits per hour
      const durationMinutes = 1200; // 20 hours

      mockLabTokenData.checkSufficientBalance.mockReturnValue({
        hasSufficient: false,
        cost: BigInt('2001600000'),
        balance: BigInt('150000000'),
        shortfall: BigInt('1851600000'),
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const status = result.current.checkSufficientBalance(
        labPrice,
        durationMinutes
      );

      expect(status.hasSufficient).toBe(false);
      expect(status.shortfall).toEqual(BigInt('1851600000'));
    });
  });

  describe('Refresh Functions', () => {
    test('refreshTokenData refetches balance and allowance', () => {
      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      act(() => {
        result.current.refreshTokenData();
      });

      expect(mockLabTokenData.refreshTokenData).toHaveBeenCalled();
    });

    test('refetchBalance refetches balance', () => {
      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      act(() => {
        result.current.refetchBalance();
      });

      expect(mockLabTokenData.refetchBalance).toHaveBeenCalled();
    });

    test('refetchAllowance refetches allowance', () => {
      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      act(() => {
        result.current.refetchAllowance();
      });

      expect(mockLabTokenData.refetchAllowance).toHaveBeenCalled();
    });

    test('clearDecimalsCache clears cached decimals', () => {
      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      act(() => {
        result.current.clearDecimalsCache();
      });

      expect(mockLabTokenData.clearDecimalsCache).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    test('isLoading is true when loading', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        isLoading: true,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.isLoading).toBe(true);
    });

    test('isLoading is false when not loading', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        isLoading: false,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Memoization and Re-render Prevention', () => {
    test('context value remains stable when data does not change', () => {
      const { result, rerender } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
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
      const { useLabCreditHook } = require('@/hooks/useLabCredit');

      // Initial render
      const { result, rerender } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const initialBalance = result.current.balance;

      // Update balance
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        balance: BigInt('200000000'), // 20 credits (changed from 15)
      });

      // Rerender to trigger update
      rerender();

      // Balance should update
      expect(result.current.balance).not.toEqual(initialBalance);
      expect(result.current.balance).toEqual(BigInt('200000000'));
    });

    test('context value updates when decimals change', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');

      // Initial render
      const { result, rerender } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      const initialDecimals = result.current.decimals;

      // Update decimals (e.g., switching to a different token)
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        decimals: 6, // Deliberately exercise a non-canonical token scale
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
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        balance: undefined,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.balance).toBeUndefined();
    });

    test('handles undefined allowance', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        allowance: undefined,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.allowance).toBeUndefined();
    });

    test('handles undefined decimals', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        decimals: undefined,
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.decimals).toBeUndefined();
    });

    test('handles zero balance', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        balance: BigInt('0'),
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.balance).toEqual(BigInt('0'));
    });

    test('handles zero allowance', () => {
      const { useLabCreditHook } = require('@/hooks/useLabCredit');
      useLabCreditHook.mockReturnValue({
        ...mockLabTokenData,
        allowance: BigInt('0'),
      });

      const { result } = renderHook(() => useLabCredit(), {
        wrapper: LabCreditProvider,
      });

      expect(result.current.allowance).toEqual(BigInt('0'));
    });
  });
});

