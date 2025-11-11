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
    error: labsErrorDetails,
    metadataError 
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
            <button 
              className={`px-4 py-2 rounded mt-4 max-h-[45px] w-2/3 mx-auto transition-colors ${
                lab?.isListed === false 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-brand hover:bg-hover-dark text-white'
              }`}
              onClick={() => {
                if (lab?.isListed !== false) {
                  router.push(`/reservation/${lab?.id}`);
                }
              }} 
              disabled={lab?.isListed === false}
              aria-label={lab?.isListed === false ? 'Lab not available for booking' : `Rent ${lab?.name}`}>
              {lab?.isListed === false ? 'Not Available' : 'Book Lab'}
            </button>
          </div>
        </article>

        {/* Lab Details Section */}
        <article className="w-full md:w-2/5 mt-4">
          <header>
            <h1 className="text-2xl text-header-bg font-bold pb-2 text-center">
              {lab?.name}
            </h1>
            
            {/* Unlisted Lab Badge */}
            {lab?.isListed === false && (
              <div className="flex justify-center mb-4">
                <div className="bg-[#1f2426] border-l-4 border-brand p-3 rounded-r-lg shadow-sm">
                  <div className="flex items-center">
                    <div className="shrink-0">
                      <svg className="size-5 text-brand" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-header-bg font-medium">
                        This laboratory is currently unlisted and not available for booking.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-center">
              <hr className="mb-2 separator-width w-1/2" />
            </div>
          </header>
          
          {/* Metadata warning banner - shown instead of description when metadata is missing */}
          {metadataError ? (
            <div className="bg-warning-bg border border-warning-border rounded-lg p-4 mb-4">
              <p className="text-warning-text text-sm">
                ⚠️ <strong>Information Unavailable:</strong> Additional details for this laboratory are currently missing. 
                Basic information and booking functionality remain accessible.
              </p>
            </div>
          ) : (
            <p className="text-sm text-justify">{lab?.description}</p>
          )}

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
