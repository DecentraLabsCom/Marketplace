import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '@/context/UserContext'
import devLog from '@/utils/dev/logger'
import {
  CREDIT_DECIMALS as DEFAULT_LAB_TOKEN_DECIMALS,
  formatRawCredits,
  formatRawPricePerHour,
} from '@/utils/blockchain/creditUnits'

const tryParseBigInt = (value) => {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^[+-]?\d+$/.test(trimmed)) {
      try {
        return BigInt(trimmed)
      } catch {
        return null
      }
    }
  }
  return null
}

export const clearDecimalsCache = () => {}

async function fetchInstitutionCreditBalance(institutionAddress) {
  const response = await fetch(
    `/api/contract/institution/getInstitutionCreditBalance?institutionAddress=${encodeURIComponent(institutionAddress)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch institution credit balance: ${response.status}`)
  }

  return response.json()
}

async function fetchLabTokenAddress() {
  const response = await fetch('/api/contract/reservation/getLabTokenAddress', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch service-credit ledger address: ${response.status}`)
  }

  return response.json()
}

export function useLabTokenHook() {
  const { address, isSSO, isLoggedIn } = useUser()
  const shouldFetchInstitutionData = Boolean(isSSO && isLoggedIn && address)
  const shouldFetchLedgerMetadata = Boolean(isSSO && isLoggedIn)

  const {
    data: balanceResponse,
    refetch: refetchBalance,
    isLoading: isBalanceLoading,
  } = useQuery({
    queryKey: ['lab-token', 'institution-credit-balance', address],
    queryFn: () => fetchInstitutionCreditBalance(address),
    enabled: shouldFetchInstitutionData,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: shouldFetchInstitutionData ? 6_000 : false,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    retry: 1,
  })

  const {
    data: tokenAddressResponse,
    refetch: refetchTokenAddress,
    isLoading: isTokenAddressLoading,
  } = useQuery({
    queryKey: ['lab-token', 'ledger-address'],
    queryFn: fetchLabTokenAddress,
    enabled: shouldFetchLedgerMetadata,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const balance = tryParseBigInt(balanceResponse?.balance) ?? 0n
  const allowance = balance
  const decimals = DEFAULT_LAB_TOKEN_DECIMALS
  const labTokenAddress = tokenAddressResponse?.labTokenAddress || null

  const calculateReservationCost = useCallback((labPrice, durationMinutes) => {
    if (!labPrice || !durationMinutes) return 0n

    try {
      const pricePerSecondUnits = tryParseBigInt(labPrice)
      if (pricePerSecondUnits === null || pricePerSecondUnits < 0n) return 0n

      const durationSeconds = Number(durationMinutes) * 60
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0n

      return pricePerSecondUnits * BigInt(Math.floor(durationSeconds))
    } catch (error) {
      devLog.error('Error calculating reservation cost:', error)
      return 0n
    }
  }, [])

  const checkBalanceAndAllowance = useCallback((requiredAmount) => {
    const normalizedRequiredAmount = tryParseBigInt(requiredAmount) ?? 0n
    const hasSufficientBalance = balance >= normalizedRequiredAmount

    return {
      hasSufficientBalance,
      hasSufficientAllowance: hasSufficientBalance,
      balance,
      allowance,
      requiredAmount: normalizedRequiredAmount,
    }
  }, [balance, allowance])

  const checkSufficientBalance = useCallback((labPrice, durationMinutes) => {
    const cost = calculateReservationCost(labPrice, durationMinutes)

    return {
      hasSufficient: balance >= cost,
      cost,
      balance,
      shortfall: cost > balance ? cost - balance : 0n,
    }
  }, [balance, calculateReservationCost])

  const formatTokenAmount = useCallback((amount) => {
    if (!decimals) return '0'
    return formatRawCredits(tryParseBigInt(amount) ?? 0n, decimals)
  }, [decimals])

  const formatPrice = useCallback((price) => {
    if (price === null || price === undefined) return '0'

    try {
      const priceUnits = tryParseBigInt(price)
      if (priceUnits !== null) {
        return formatRawPricePerHour(priceUnits, decimals)
      }

      const numericPrice = Number(price)
      if (!Number.isFinite(numericPrice)) return '0'

      return formatRawPricePerHour(BigInt(Math.trunc(numericPrice)), decimals)
    } catch (error) {
      devLog.error('Error formatting price:', error, 'Price:', price, 'Decimals:', decimals)
      return '0'
    }
  }, [decimals])

  const refreshTokenData = useCallback(() => {
    refetchBalance()
    refetchTokenAddress()
  }, [refetchBalance, refetchTokenAddress])

  return {
    balance,
    allowance,
    decimals,
    isLoading: Boolean(isBalanceLoading || isTokenAddressLoading),
    labTokenAddress,
    calculateReservationCost,
    checkBalanceAndAllowance,
    checkSufficientBalance,
    formatTokenAmount,
    formatPrice,
    refreshTokenData,
    refetchBalance,
    refetchAllowance: refetchBalance,
    clearDecimalsCache,
  }
}
