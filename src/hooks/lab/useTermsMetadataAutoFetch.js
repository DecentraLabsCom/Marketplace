import { useState, useEffect, useRef } from 'react'

function convertBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function guessVersionFromUrl(url) {
  const filename = url.split('/').pop() || ''
  const versionRegex = /v(?:ersion)?[-_]?(\d+(?:\.\d+)*)/i
  const match = filename.match(versionRegex)
  return match ? match[1] : ''
}

/**
 * Automatically fetches Terms of Use document metadata (SHA-256, version, effective date)
 * when a new termsUrl is provided. Writes results back via latestLabRef / setLocalLabRef.
 *
 * @param {string} termsUrl - Absolute HTTP(S) URL of the terms document
 * @param {React.MutableRefObject} latestLabRef - Ref holding latest lab form state
 * @param {React.MutableRefObject<Function>} setLocalLabRef - Ref holding latest setLocalLab setter
 * @returns {{ loading: boolean, error: string|null }}
 */
export function useTermsMetadataAutoFetch(termsUrl, latestLabRef, setLocalLabRef) {
  const [termsFetchState, setTermsFetchState] = useState({ loading: false, error: null })
  const abortControllerRef = useRef(null)
  const lastFetchedUrlRef = useRef('')

  useEffect(() => {
    if (!termsUrl) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setTermsFetchState((prev) => (prev.loading ? { loading: false, error: null } : prev))
      lastFetchedUrlRef.current = ''
      return
    }

    if (termsUrl === lastFetchedUrlRef.current) {
      return
    }

    const fetchMetadata = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      if (!/^https?:\/\//i.test(termsUrl)) {
        setTermsFetchState({ loading: false, error: 'Terms link must be an absolute HTTP(S) URL.' })
        return
      }

      const controller = new AbortController()
      abortControllerRef.current = controller
      setTermsFetchState({ loading: true, error: null })

      try {
        const response = await fetch(termsUrl, { signal: controller.signal })
        if (!response.ok) {
          throw new Error('Unable to download the Terms of Use document.')
        }

        const buffer = await response.arrayBuffer()
        let shaValue = ''
        if (typeof window !== 'undefined' && window.crypto?.subtle?.digest) {
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer)
          shaValue = convertBufferToHex(hashBuffer)
        }

        const versionGuess = guessVersionFromUrl(termsUrl)
        const today = new Date().toISOString().split('T')[0]
        const currentLab = latestLabRef.current || {}
        const currentTerms = currentLab.termsOfUse || {}
        const updates = { url: termsUrl }

        if (!currentTerms.version && versionGuess) {
          updates.version = versionGuess
        }
        if (!currentTerms.effectiveDate) {
          updates.effectiveDate = today
        }
        if (shaValue) {
          updates.sha256 = shaValue
        }

        setLocalLabRef.current({
          ...currentLab,
          termsOfUse: {
            ...currentTerms,
            ...updates
          }
        })

        lastFetchedUrlRef.current = termsUrl
        setTermsFetchState({ loading: false, error: null })
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error('Failed to auto-populate terms metadata:', error)
        setTermsFetchState({
          loading: false,
          error: 'Unable to auto-fill version/date/hash for this link.'
        })
        lastFetchedUrlRef.current = ''
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    }

    fetchMetadata()
  }, [termsUrl, latestLabRef, setLocalLabRef])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  return termsFetchState
}
