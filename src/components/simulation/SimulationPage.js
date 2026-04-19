"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/ui'
import { useLabById } from '@/hooks/lab/useLabs'
import { isFmu } from '@/utils/resourceType'
import SimulationRunner from './SimulationRunner'
import SimulationErrorBoundary from './SimulationErrorBoundary'
import { LabHeroSkeleton } from '@/components/skeletons'

/**
 * SimulationPage — top-level page component for /simulation/[id].
 *
 * Loads the FMU resource by ID and renders SimulationRunner.
 * Redirects to the lab detail page if the resource is not an FMU.
 *
 * @param {Object} props
 * @param {string|number} props.id - Resource / lab token ID
 * @param {string} [props.reservationKey] - Active reservation key for authorisation
 */
export default function SimulationPage({ id, reservationKey }) {
  const {
    data: lab,
    isLoading: loading,
    isError: labError,
    error: labErrorDetails,
  } = useLabById(id)
  const router = useRouter()

  if (labError) {
    return (
      <Container as="main" padding="sm">
        <div className="bg-error-bg border border-error-border rounded-lg p-6 max-w-md mx-auto mt-8">
          <h2 className="text-error-text text-xl font-semibold mb-2">Error Loading Resource</h2>
          <p className="text-error-text mb-4">
            {labErrorDetails?.message || 'Failed to load resource data'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-error text-white px-4 py-2 rounded hover:bg-error-dark transition-colors"
          >
            Retry
          </button>
        </div>
      </Container>
    )
  }

  if (loading) {
    return (
      <Container as="main" padding="sm">
        <div className="mt-4">
          <LabHeroSkeleton />
        </div>
      </Container>
    )
  }

  if (!lab) {
    return (
      <Container as="main" padding="sm">
        <div className="text-center text-neutral-200 mt-8">Resource not found.</div>
      </Container>
    )
  }

  // Redirect if the resource is not an FMU
  if (!isFmu(lab)) {
    router.replace(`/lab/${id}`)
    return null
  }

  return (
    <Container as="main" padding="sm">
      <div className="mt-4 max-w-4xl mx-auto">
        <SimulationErrorBoundary>
          <SimulationRunner lab={lab} reservationKey={reservationKey} />
        </SimulationErrorBoundary>
      </div>
    </Container>
  )
}

SimulationPage.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  reservationKey: PropTypes.string,
}
