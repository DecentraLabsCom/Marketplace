"use client";
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import MediaDisplayWithFallback from '@/components/ui/media/MediaDisplayWithFallback'

/**
 * Document carousel component for displaying multiple documents with navigation
 * Shows documents with previous/next controls and thumbnail indicators
 * @param {Object} props - Component props
 * @param {Array} props.docs - Array of document objects to display
 * @param {string} [props.maxHeight] - Maximum height CSS value for the carousel
 * @returns {JSX.Element} Document carousel with navigation controls
 */
const DocsCarrousel = React.memo(function DocsCarrousel({ docs, maxHeight = 200 }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const normalizedDocs = useMemo(() => docs.filter((doc) => Boolean(doc)), [docs]);
  const currentDoc = normalizedDocs[currentIndex] || null;
  const viewerHeight = maxHeight ? `${maxHeight}px` : '200px';

  useEffect(() => {
    if (currentIndex >= normalizedDocs.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, normalizedDocs.length]);

  const handleSlide = (index) => {
    setCurrentIndex(index);
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + normalizedDocs.length) % normalizedDocs.length);
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % normalizedDocs.length);
  };

  if (normalizedDocs.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-gray-200 text-gray-700" style={{ height: viewerHeight }}>
        No documents available
      </div>
    );
  }

  return (
    <>
    <div className="relative w-full overflow-hidden" 
      style={{ height: viewerHeight }}>
        {normalizedDocs.map((doc, index) => (
          <div key={index} className={`absolute inset-0 transition-opacity duration-700 ${
                    index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <MediaDisplayWithFallback mediaPath={doc} mediaType={'doc'} title={`doc ${index + 1}`} height={viewerHeight} width="100%" 
            className="rounded-lg" />
          </div>
        ))}

      {currentDoc && (
        <div className="absolute right-2 top-2 z-30 flex gap-2">
          <a
            href={currentDoc}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/80"
            aria-label="Open document in a new tab"
          >
            Open
          </a>
          <a
            href={currentDoc}
            download
            className="rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/80"
            aria-label="Download document"
          >
            Download
          </a>
          <button
            type="button"
            onClick={() => setIsMaximized(true)}
            className="rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/80"
            aria-label="Maximize document"
          >
            Maximize
          </button>
        </div>
      )}

      {normalizedDocs.length > 1 && (
      <>
        {/* Slide handles */}
        <div className='flex justify-center'>
          <div className="absolute bg-slate-400 rounded-md px-2 py-px bottom-1 z-20 mb-7 
          flex list-none justify-center p-0 pointer-events-auto">
          {normalizedDocs.map((_, index) => (
            <button key={index} type="button" data-twe-slide-to={index}
              className={`mx-[3px] box-content h-[3px] w-[30px] flex-initial cursor-pointer border-0 border-y-[10px] 
              border-solid border-transparent bg-white hover:bg-primary-500 bg-clip-padding p-0 indent-[999px] opacity-80 
              transition-opacity duration-[600ms] ease-[cubic-bezier(0.25,0.1,0.25,1.0)] motion-reduce:transition-none 
              ${ index === currentIndex ? 'opacity-100 bg-primary-200' : '' }`}
              aria-current={index === currentIndex ? 'true' : 'false'} aria-label={`Slide ${index + 1}`}
              onClick={() => handleSlide(index)} />
          ))}
          </div>
        </div>

        {/* Move to previous doc */}
        <button onClick={handlePrev} className="absolute inset-y-0 left-0 z-20 flex-center w-[15%] 
          border-0 bg-none p-0 text-slate-600 opacity-100 hover:opacity-90 duration-150 
          transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1.0)] pointer-events-auto group" type="button">
          <span className="inline-block size-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
              stroke="currentColor" className="size-6 transition-colors duration-150 ease-in-out 
              group-hover:text-primary-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </span>
          <span className="sr-only">
            Previous
          </span>
        </button>

        {/* Move to next doc */}
        <button onClick={handleNext} className="absolute inset-y-0 right-0 z-20 flex-center w-[15%] 
          border-0 bg-none p-0 text-slate-600 opacity-100 hover:opacity-90 duration-150 
          transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1.0)] pointer-events-auto group" type="button">
          <span className="inline-block size-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
            stroke="currentColor" className="size-6 transition-colors duration-150 ease-in-out 
              group-hover:text-primary-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </span>
          <span className="sr-only">Next</span>
        </button>
      </>
      )}
    </div>

    {isMaximized && currentDoc && createPortal(
      <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Maximized document viewer">
        <div className="relative h-[90vh] w-full max-w-6xl rounded-lg bg-white p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-gray-700">Document viewer</div>
            <div className="flex gap-2">
              <a
                href={currentDoc}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-gray-700 px-3 py-1 text-xs text-white hover:bg-gray-800"
              >
                Open
              </a>
              <a
                href={currentDoc}
                download
                className="rounded bg-gray-700 px-3 py-1 text-xs text-white hover:bg-gray-800"
              >
                Download
              </a>
              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="rounded bg-gray-700 px-3 py-1 text-xs text-white hover:bg-gray-800"
                aria-label="Close maximized document"
              >
                Close
              </button>
            </div>
          </div>
          <MediaDisplayWithFallback
            mediaPath={currentDoc}
            mediaType={'doc'}
            title={'maximized document'}
            height="100%"
            width="100%"
            className="rounded"
          />
        </div>
      </div>,
      document.body
    )}
    </>
  );
});

DocsCarrousel.propTypes = {
  docs: PropTypes.arrayOf(PropTypes.string).isRequired,
  maxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}

export default DocsCarrousel;
