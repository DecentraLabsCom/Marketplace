'use client'

import { useEffect, useState } from 'react'
import { normalizeLabCategories } from '@/utils/accessPolicy/labCategoryAccess'

export function useLabAccessEligibility(labId, options = {}) {
  const categories = normalizeLabCategories(options.categories || options.lab)
  const enabled = options.enabled !== false && Boolean(labId)
  const [state, setState] = useState({ data: null, isLoading: enabled, isError: false })

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, isLoading: false, isError: false })
      return undefined
    }
    const controller = new AbortController()
    setState((current) => ({ ...current, isLoading: true, isError: false }))
    const params = new URLSearchParams()
    categories.forEach((category) => params.append('categories', category))
    if (options.price !== undefined && options.price !== null) params.set('price', String(options.price))
    fetch(`/api/backend/access-policy/labs/${encodeURIComponent(labId)}/eligibility?${params.toString()}`, {
      credentials: 'include', signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Eligibility could not be resolved')
        return payload
      })
      .then((data) => setState({ data, isLoading: false, isError: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, isLoading: false, isError: true, error })
      })
    return () => controller.abort()
  }, [enabled, labId, options.price, categories.join('|')])

  return { ...state, isAllowed: state.data?.allowed !== false, categories }
}
