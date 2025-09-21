"use client";
import React from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/ui'
import { useLabById } from '@/hooks/lab/useLabs'
import { useLabToken } from '@/context/LabTokenContext'
import Carrousel from '@/components/ui/Carrousel'
import DocsCarrousel from '@/components/ui/DocsCarrousel'
import { LabHeroSkeleton } from '@/components/skeletons'

/**
 * Detailed lab information display component
 * Shows comprehensive lab data including images, documentation, pricing, and provider info
 * @param {Object} props
 * @param {string|number} props.id - Lab ID to display details for
 * @returns {JSX.Element} Complete lab detail view with images, docs, and metadata
 */
export default function LabDetail({ id }) {
  const { 
    data: lab,
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useLabById(id);
  const { formatPrice } = useLabToken();
  const router = useRouter();

  // Lab is directly returned from the hook, no need for additional processing

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <Container as="main" padding="sm">
        <div className="bg-error-bg border border-error-border rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-error-text text-xl font-semibold mb-2">Error Loading Lab</h2>
          <p className="text-error-text mb-4">
            {labsErrorDetails?.message || 'Failed to load laboratory data'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-error text-white px-4 py-2 rounded hover:bg-error-dark transition-colors"
          >
            Retry
          </button>
        </div>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container as="main" padding="sm">
        <LabHeroSkeleton />
      </Container>
    );
  }

  if (!lab) {
    return <div className="text-center">Lab not found.</div>
  }

  return (
    <Container as="main" padding="sm">
      <section className="flex flex-col md:flex-row md:justify-center gap-6 md:gap-10">
        {/* Carousel Section */}
        <article className="w-full md:w-1/2 flex flex-col p-4">
          <div className="size-full flex flex-col justify-center">
            <Carrousel lab={lab} />
            {/* Price and Provider info - moved here */}
            <div className="flex justify-between items-center text-text-secondary font-semibold mt-4 mb-2">
              <span>{formatPrice(lab?.price)} $LAB / hour</span>
              {lab?.provider && (
                <span className="truncate max-w-[50%]" title={lab.provider}>
                  Provider: {lab.provider}
                </span>
              )}
            </div>
            <button className="bg-brand hover:bg-hover-dark text-white px-4 py-2 rounded mt-4 
              max-h-[45px] w-2/3 mx-auto" onClick={() => 
              router.push(`/reservation/${lab?.id}`)} aria-label={`Rent ${lab?.name}`}>
              Book Lab
            </button>
          </div>
        </article>

        {/* Lab Details Section */}
        <article className="w-full md:w-2/5 mt-4">
          <header>
            <h1 className="text-2xl text-header-bg font-bold pb-2 text-center">
              {lab?.name}
            </h1>
            <div className="flex justify-center">
              <hr className="mb-2 separator-width w-1/2" />
            </div>
          </header>
          <p className="text-sm text-justify">{lab?.description}</p>

          <div className="mt-4">
            {/* Category */}
            {lab?.category && (
              <div className="flex items-center">
                <span className="bg-ui-label-dark text-neutral-200 inline-flex items-center justify-center 
                py-1 px-3 text-sm rounded">
                  {lab.category}
                </span>
              </div>
            )}

            {/* Keywords */}
            <div className="flex flex-wrap gap-2 mt-2">
              {(Array.isArray(lab.keywords) ? lab.keywords : []).map((keyword) => (
                <span key={keyword} className="bg-text-secondary text-neutral-200 inline-flex items-center 
                  justify-center py-1 px-3 text-sm rounded">
                  {keyword}
                </span>
              ))}
            </div>

            {/* Documentation */}
            <div className={`flex flex-col text-center mt-4 overflow-hidden`}>
              <h3 className="text-header-bg text-lg font-semibold">
                Documentation
              </h3>
              <div className="transition-opacity duration-300 opacity-100 mt-2">
                {Array.isArray(lab.docs) && lab.docs.length > 0 ? (
                  <DocsCarrousel docs={lab.docs} />
                ) : (
                  <span className="text-center p-2">No documents available</span>
                )}
              </div>
            </div>
          </div>
        </article>
      </section>
    </Container>
  )
}

LabDetail.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  provider: PropTypes.string.isRequired
}
