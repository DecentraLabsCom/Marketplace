import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { useUser } from '@/context/UserContext'
import devLog from '@/utils/dev/logger'

const DEFAULT_LAB_TOKEN_DECIMALS = 1

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

const formatFixed2FromScaledInt = (scaledValue) => {
  if (typeof scaledValue !== 'bigint') return '0.00'
  const sign = scaledValue < 0n ? '-' : ''
  const absValue = scaledValue < 0n ? -scaledValue : scaledValue
  const integerPart = absValue / 100n
  const fractionalPart = absValue % 100n
  return `${sign}${integerPart.toString()}.${fractionalPart.toString().padStart(2, '0')}`
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
    if (!decimals) return '0.00'

    try {
      const normalizedAmount = tryParseBigInt(amount) ?? 0n
      const formatted = parseFloat(formatUnits(normalizedAmount, decimals))
      const rounded = Math.round(formatted * 100) / 100
      return rounded.toFixed(2)
    } catch (error) {
      devLog.error('Error formatting token amount:', error)
      return '0.00'
    }
  }, [decimals])

  const formatPrice = useCallback((price) => {
    if (price === null || price === undefined) return '0.00'

    try {
      const priceUnits = tryParseBigInt(price)
      if (priceUnits !== null) {
        const pricePerHourUnits = priceUnits * 3600n
        const divisor = 10n ** BigInt(decimals)
        if (divisor === 0n) return '0.00'

        const scaledNumerator = pricePerHourUnits * 100n
        const quotient = scaledNumerator / divisor
        const remainder = scaledNumerator % divisor
        const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient

        return formatFixed2FromScaledInt(rounded)
      }

      const numericPrice = Number(price)
      if (!Number.isFinite(numericPrice)) return '0.00'

      const pricePerSecondCredits = numericPrice / Math.pow(10, decimals)
      const pricePerHour = pricePerSecondCredits * 3600
      const roundedPrice = Math.round((pricePerHour + Number.EPSILON) * 100) / 100
      return roundedPrice.toFixed(2)
    } catch (error) {
      devLog.error('Error formatting price:', error, 'Price:', price, 'Decimals:', decimals)
      return '0.00'
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
