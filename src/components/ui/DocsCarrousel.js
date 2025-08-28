"use client";
import React, { useState } from 'react'
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
const DocsCarrousel = React.memo(function DocsCarrousel({ docs, maxHeight }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleSlide = (index) => {
    setCurrentIndex(index);
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + docs.length) % docs.length);
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % docs.length);
  };

  return (
    <div className="relative w-full overflow-hidden" 
      style={{ height: maxHeight ? `${maxHeight}px` : '200px' }}>
        {docs.filter((doc) => !!doc).map((doc, index) => (
          <div key={index} className={`absolute inset-0 transition-opacity duration-700 ${
                    index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <MediaDisplayWithFallback mediaPath={doc} mediaType={'doc'} title={`doc ${index + 1}`} height="200px" width="100%" 
            className="rounded-lg" />
          </div>
        ))}

      {docs.length > 1 && (
      <>
        {/* Slide handles */}
        <div className='flex justify-center'>
          <div className="absolute bg-slate-400 rounded-md px-2 py-px bottom-1 z-20 mb-7 
          flex list-none justify-center p-0 pointer-events-auto">
          {docs.map((_, index) => (
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
        <button onClick={handlePrev} className="absolute inset-y-0 left-0 z-20 flex w-[15%] items-center 
          justify-center border-0 bg-none p-0 text-slate-600 opacity-100 hover:opacity-90 duration-150 
          transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1.0)] pointer-events-auto group" type="button">
          <span className="inline-block size-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
              stroke="currentColor" className="size-6 transition-colors duration-150 ease-in-out 
              group-hover:text-primary-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </span>
          <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 
            ![clip:rect(0,0,0,0)]">
            Previous
          </span>
        </button>

        {/* Move to next doc */}
        <button onClick={handleNext} className="absolute inset-y-0 right-0 z-20 flex w-[15%] items-center 
          justify-center border-0 bg-none p-0 text-slate-600 opacity-100 hover:opacity-90 duration-150 
          transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1.0)] pointer-events-auto group" type="button">
          <span className="inline-block size-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
            stroke="currentColor" className="size-6 transition-colors duration-150 ease-in-out 
              group-hover:text-primary-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </span>
          <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 
              ![clip:rect(0,0,0,0)]">Next</span>
        </button>
      </>
      )}
    </div>
  );
});

DocsCarrousel.propTypes = {
  docs: PropTypes.arrayOf(PropTypes.string).isRequired,
  maxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}

DocsCarrousel.defaultProps = {
  maxHeight: 200
}

export default DocsCarrousel;
