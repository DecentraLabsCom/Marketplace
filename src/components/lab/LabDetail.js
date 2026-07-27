"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar } from '@fortawesome/free-solid-svg-icons'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import { Container } from '@/components/ui'
import { useLabById } from '@/hooks/lab/useLabs'
import { useCheckAvailable } from '@/hooks/booking/useBookingAtomicQueries'
import { useLabCredit } from '@/context/LabCreditContext'
import Carrousel from '@/components/ui/Carrousel'
import DocsCarrousel from '@/components/ui/DocsCarrousel'
import { LabHeroSkeleton } from '@/components/skeletons'
import { getLabAgeLabel, getLabRatingValue } from '@/utils/labStats'
import {
  isFmu,
  getFmuMetadata,
  formatFmuSimulationType,
  formatFmuVariableShape,
  formatFmuVariableStart,
  getFmuDimensionLegend,
} from '@/utils/resourceType'
import { formatPricePerUnit, getLabPricingUnit } from '@/utils/pricing/pricePresentation'
import AasPanel from '@/components/lab/AasPanel'
import { safeExternalHttpUrl } from '@/utils/security/safeUrl'

let countryLocaleRegistered = false

const ensureCountryLocale = () => {
  if (countryLocaleRegistered) return
  countries.registerLocale(enLocale)
  countryLocaleRegistered = true
}

const getCountryLabel = (value) => {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length !== 2) return trimmed
  ensureCountryLocale()
  return countries.getName(trimmed.toUpperCase(), 'en') || trimmed
}

/**
 * Detailed lab information display component
 * Shows comprehensive lab data including images, documentation, pricing, and provider info
 * @param {Object} props
 * @param {string|number} props.id - Lab ID to display details for
 * @returns {JSX.Element} Complete lab detail view with images, docs, and metadata
 */
export default function LabDetail({ id }) {
  const topSpacingClass = 'mt-4'
  const { 
    data: lab,
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails,
    metadataError 
  } = useLabById(id);
  const { formatPrice } = useLabCredit();
  const router = useRouter();

  // Demo availability check — stable minute-aligned start time so the query key
  // doesn't change on every render; refetchInterval handles periodic refresh.
  const demoCheckStart = useMemo(() => Math.floor(Date.now() / 60000) * 60, []);
  const { data: demoAvailData } = useCheckAvailable(
    lab?.id,
    demoCheckStart,
    60,
    {
      enabled: !!(lab?.id && lab?.demoEnabled),
      refetchInterval: 60000,
      staleTime: 30000,
    }
  );

  const labIsFmu = isFmu(lab);
  const fmuMeta = labIsFmu ? getFmuMetadata(lab) : null;
  const fmuSimulationTypeLabel = formatFmuSimulationType(fmuMeta?.simulationType);
  const fmuSummaryItems = useMemo(() => {
    if (!fmuMeta) return [];

    const items = [];
    if (fmuMeta.fmiVersion) {
      items.push({ label: 'FMI Version', value: fmuMeta.fmiVersion });
    }
    if (fmuMeta.simulationType) {
      items.push({ label: 'Type', value: fmuSimulationTypeLabel });
    }
    if (fmuMeta.defaultStartTime != null || fmuMeta.defaultStopTime != null) {
      items.push({
        label: 'Default Time',
        value: `${fmuMeta.defaultStartTime ?? 0}s – ${fmuMeta.defaultStopTime ?? '?'}s`,
      });
    }
    if (fmuMeta.defaultStepSize != null) {
      items.push({ label: 'Step Size', value: `${fmuMeta.defaultStepSize}s` });
    }
    return items;
  }, [
    fmuMeta?.fmiVersion,
    fmuMeta?.simulationType,
    fmuMeta?.defaultStartTime,
    fmuMeta?.defaultStopTime,
    fmuMeta?.defaultStepSize,
    fmuSimulationTypeLabel,
  ]);
  const [fmuSummaryFitsSingleRow, setFmuSummaryFitsSingleRow] = useState(false);
  const fmuSummaryGridRef = useRef(null);

  useEffect(() => {
    const summaryGrid = fmuSummaryGridRef.current;
    if (!summaryGrid) return undefined;

    const measureSummary = () => {
      const availableWidth = summaryGrid.clientWidth;
      const summaryCards = Array.from(summaryGrid.children);
      const previousGridStyle = summaryGrid.getAttribute('style');
      const previousCardStyles = summaryCards.map((card) => card.getAttribute('style'));

      summaryGrid.style.position = 'absolute';
      summaryGrid.style.visibility = 'hidden';
      summaryGrid.style.width = 'max-content';
      summaryGrid.style.gridTemplateColumns = 'repeat(4, max-content)';
      summaryCards.forEach((card) => {
        card.style.width = 'max-content';
        card.style.whiteSpace = 'nowrap';
      });

      const requiredWidth = summaryGrid.scrollWidth;

      if (previousGridStyle === null) {
        summaryGrid.removeAttribute('style');
      } else {
        summaryGrid.setAttribute('style', previousGridStyle);
      }
      summaryCards.forEach((card, index) => {
        const previousStyle = previousCardStyles[index];
        if (previousStyle === null) {
          card.removeAttribute('style');
        } else {
          card.setAttribute('style', previousStyle);
        }
      });

      setFmuSummaryFitsSingleRow(
        fmuSummaryItems.length === 4 && requiredWidth > 0 && requiredWidth <= availableWidth
      );
    };

    measureSummary();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const resizeObserver = new ResizeObserver(measureSummary);
    resizeObserver.observe(summaryGrid);
    return () => resizeObserver.disconnect();
  }, [fmuSummaryItems]);

  // Lab is directly returned from the hook, no need for additional processing

  // âŒ Error handling for React Query
  if (labsError) {
    return (
      <Container padding="sm">
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
      <Container padding="sm">
        <div className={topSpacingClass}>
          <LabHeroSkeleton />
        </div>
      </Container>
    );
  }

  if (!lab) {
    return <div className="text-center text-neutral-200">Lab not found.</div>
  }

  const labIdentifier = lab.id ?? lab.labId ?? lab.tokenId ?? id
  const ratingValue = getLabRatingValue(lab.reputation);
  const ratingLabel = ratingValue !== null ? ratingValue.toFixed(1) : null;
  const totalEvents = lab.reputation?.totalEvents ? Number(lab.reputation.totalEvents) : 0;
  const eventsLabel = totalEvents > 0 ? `${totalEvents} events` : 'No events yet';
  const pricePresentation = formatPricePerUnit({
    price: lab.price,
    unit: getLabPricingUnit(lab),
    formatPrice,
  });
  const ageLabel = getLabAgeLabel(lab.createdAt) || 'New';
  const providerCountryLabel = getCountryLabel(lab?.providerInfo?.country);
  const fmuDimensionLegend = fmuMeta
    ? getFmuDimensionLegend(fmuMeta.modelVariables)
    : [];
  const hasFmuModelVariables = Array.isArray(fmuMeta?.modelVariables) && fmuMeta.modelVariables.length > 0;
  const hasFmuDimensionDescriptions = fmuDimensionLegend.some((dimension) => dimension.description);
  const safeAccessUri = safeExternalHttpUrl(lab?.accessURI)

  return (
    <Container padding="sm">
      <section className={topSpacingClass}>
        <header className="w-full">
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

        <div
          data-testid="lab-content-columns"
          className="mt-4 flex flex-col md:flex-row md:items-start md:justify-center gap-6 md:gap-10"
        >
        {/* Carousel Section */}
        <article className="w-full md:w-1/2 flex flex-col p-4 md:pt-0">
          <div className="size-full flex flex-col justify-center">
            <Carrousel lab={lab} labId={labIdentifier} />
            {/* Price and Provider info - moved here */}
            <div className="flex justify-between items-start text-text-secondary font-semibold mt-4 mb-2">
              <span className="text-text-secondary">{pricePresentation.text}</span>
              {(lab?.provider || providerCountryLabel) && (
                <div className="text-right max-w-[55%]">
                  {lab?.provider && (
                    <span className="block truncate text-text-secondary" title={lab.provider}>
                      Provider: {lab.provider}
                    </span>
                  )}
                  {providerCountryLabel && (
                    <span className="block text-xs text-text-secondary/80">
                      Country: {providerCountryLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button 
              className={`px-4 py-2 rounded mt-4 max-h-11.25 w-2/3 mx-auto transition-colors ${
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
              aria-label={lab?.isListed === false ? 'Lab not available for booking' : labIsFmu ? `Book ${lab?.name} simulation` : `Rent ${lab?.name}`}>
              {lab?.isListed === false ? 'Not Available' : labIsFmu ? 'Book Simulation' : 'Book Lab'}
            </button>

            {/* Demo Access */}
            {lab?.demoEnabled && safeAccessUri && (
              <div className="mt-3 w-2/3 mx-auto">
                {demoAvailData?.isAvailable === false ? (
                  <p className="text-center text-sm text-text-secondary bg-[#1f2426] rounded px-3 py-2">
                    Lab currently reserved
                  </p>
                ) : (
                  <a
                    href={safeAccessUri || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center px-4 py-2 rounded bg-brand/20 border border-brand text-brand hover:bg-brand hover:text-white transition-colors text-sm font-medium"
                    aria-label={`Try ${lab?.name} demo`}
                  >
                    Try Demo
                  </a>
                )}
              </div>
            )}
          </div>
        </article>

        {/* Lab Details Section */}
        <article data-testid="lab-details-column" className="w-full md:w-2/5 md:mt-0">
          <div className="mt-0 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            <div className="rounded-lg border border-[#2a2f33] bg-[#1f2426] p-3">
              <div className="text-xs uppercase tracking-wide text-text-secondary">Rating</div>
              <div className="mt-1 flex items-center gap-2">
                {ratingLabel ? (
                  <>
                    <FontAwesomeIcon icon={faStar} className="text-brand text-sm" />
                    <span className="text-sm font-semibold text-header-bg">{ratingLabel}</span>
                    <span className="text-sm text-text-secondary">/5</span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-header-bg">No ratings</span>
                )}
              </div>
              <div className="text-xs text-text-secondary">{eventsLabel}</div>
            </div>
            <div className="rounded-lg border border-[#2a2f33] bg-[#1f2426] p-3">
              <div className="text-xs uppercase tracking-wide text-text-secondary">Lab age</div>
              <div className="mt-1 text-sm font-semibold text-header-bg">{ageLabel}</div>
              <div className="text-xs text-text-secondary">On-chain registration</div>
            </div>
          </div>
          
          {/* Metadata warning banner - shown instead of description when metadata is missing */}
          {metadataError ? (
            <div className="mt-4 bg-warning-bg border border-warning-border rounded-lg p-4 mb-4">
              <p className="text-warning-text text-sm">
                Warning: <strong>Information Unavailable:</strong> Additional details for this laboratory are currently missing.
                Basic information and booking functionality remain accessible.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-justify text-neutral-200">{lab?.description}</p>
          )}

          <div className="mt-4">
            {/* Category */}
            {lab?.category && (
            <div className="flex items-center gap-2">
              {Array.isArray(lab.category) ? (
                lab.category.map((cat) => (
                  <span key={cat} className="bg-ui-label-dark text-neutral-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded">
                    {cat}
                  </span>
                ))
              ) : (
                <span className="bg-ui-label-dark text-neutral-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded">
                  {lab.category}
                </span>
              )}
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

            {/* FMU Metadata Section */}
            {labIsFmu && fmuMeta && (
              <div className="mt-4 rounded-lg border border-[#2a2f33] bg-[#1f2426] p-4">
                <h3 className="text-header-bg text-lg font-semibold mb-3">FMU Simulation Details</h3>
                <div
                  ref={fmuSummaryGridRef}
                  data-testid="fmu-summary-grid"
                  className={`grid grid-cols-2 gap-3 text-sm ${
                    fmuSummaryFitsSingleRow ? 'md:grid-cols-[repeat(4,minmax(max-content,1fr))]' : ''
                  }`}
                >
                  {fmuSummaryItems.map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-[#2a2f33] bg-[#1f2426] p-3">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {label}
                      </div>
                      <p className={`text-neutral-200 font-medium ${fmuSummaryFitsSingleRow ? 'md:whitespace-nowrap' : ''}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Model variables and dimension legend share one scroll region so the FMU panel keeps its height. */}
                {(hasFmuModelVariables || fmuDimensionLegend.length > 0) && (
                  <div className="mt-4">
                    {hasFmuModelVariables && (
                      <h4 className="text-header-bg text-sm font-semibold mb-2">Model Variables</h4>
                    )}
                    <div
                      data-testid="fmu-variables-scroll"
                      className="max-h-48 overflow-x-auto overflow-y-auto rounded border border-[#2a2f33]"
                    >
                      {hasFmuModelVariables && (
                        <table className="w-full text-xs">
                          <thead className="bg-[#181b1d] sticky top-0">
                            <tr>
                              <th className="text-left px-2 py-1 text-text-secondary">Name</th>
                              <th className="text-left px-2 py-1 text-text-secondary">Type</th>
                              <th className="text-left px-2 py-1 text-text-secondary">Causality</th>
                              <th className="text-left px-2 py-1 text-text-secondary">Shape</th>
                              <th className="text-left px-2 py-1 text-text-secondary">Start</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fmuMeta.modelVariables.map((v, i) => (
                              <tr key={v.name || i} className="border-t border-[#2a2f33]">
                                <td className="px-2 py-1 text-neutral-200 font-mono truncate max-w-35" title={v.name}>{v.name}</td>
                                <td className="px-2 py-1 text-neutral-200">{v.type || '—'}</td>
                                <td className="px-2 py-1">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    v.causality === 'input' ? 'bg-blue-900/50 text-blue-300' :
                                    v.causality === 'output' ? 'bg-green-900/50 text-green-300' :
                                    'bg-gray-700 text-gray-300'
                                  }`}>
                                    {v.causality || 'local'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-neutral-200 whitespace-nowrap">
                                  {formatFmuVariableShape(v, fmuMeta.modelVariables)}
                                </td>
                                <td className="px-2 py-1 text-neutral-200 break-words max-w-48">
                                  {formatFmuVariableStart(v.start)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {fmuDimensionLegend.length > 0 && (
                        <div className="mt-4 rounded border border-[#2a2f33] bg-[#181b1d] p-3">
                          <h4 className="text-header-bg text-sm font-semibold mb-2">Dimension relationships</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-[#181b1d]">
                                <tr>
                                  <th className="text-left px-2 py-1 text-text-secondary">Dimension</th>
                                  <th className="text-left px-2 py-1 text-text-secondary">Referenced by</th>
                                  {hasFmuDimensionDescriptions && (
                                    <th className="text-left px-2 py-1 text-text-secondary">Description</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {fmuDimensionLegend.map((dimension) => (
                                  <tr key={dimension.name} className="border-t border-[#2a2f33]">
                                    <td className="px-2 py-1 font-mono text-neutral-200">{dimension.name}</td>
                                    <td className="px-2 py-1 text-neutral-300">{dimension.usedBy.join(', ')}</td>
                                    {hasFmuDimensionDescriptions && (
                                      <td className="px-2 py-1 text-neutral-300">
                                        {dimension.description || '—'}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AAS / Digital Twin Panel â€” shown only when provider has an AAS-capable gateway */}
            {lab?.accessURI && (
              <AasPanel labId={lab.id} gatewayUrl={lab.accessURI} />
            )}

            {/* Documentation */}
            <div className={`flex flex-col text-center mt-4 overflow-hidden`}>
              <h3 className="text-header-bg text-lg font-semibold">
                Documentation
              </h3>
              <div className="transition-opacity duration-300 opacity-100 mt-2">
                {Array.isArray(lab.docs) && lab.docs.length > 0 ? (
                  <DocsCarrousel docs={lab.docs} labId={labIdentifier} />
                ) : (
                  <span className="text-center text-neutral-300 p-2">No documents available</span>
                )}
              </div>
            </div>
          </div>
        </article>
        </div>
      </section>
    </Container>
  )
}

LabDetail.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired
}

