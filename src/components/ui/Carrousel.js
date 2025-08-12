"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react'
import PropTypes from 'prop-types'
import MediaDisplayWithFallback from '@/components/ui/media/MediaDisplayWithFallback'

/**
 * Interactive image carousel component with automatic sliding
 * Displays lab images with navigation controls and auto-advance functionality
 * @param {Object} props - Component props
 * @param {Object} props.lab - Lab object containing images array
 * @param {string} [props.maxHeight] - Maximum height CSS value for the carousel
 * @returns {JSX.Element} Image carousel with controls
 */
const Carrousel = React.memo(function Carrousel({ lab, maxHeight }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef(null);

  // Memoize the images processing to prevent re-calculation on every render
  const images = useMemo(() => {
    if (!Array.isArray(lab?.images)) return [];
    return lab.images.filter(image => !!image);
  }, [lab?.images]);

  const hasImages = images.length > 0;

  // If no images, show placeholder
  if (!hasImages) {
    return (
      <div className="relative w-full overflow-hidden flex items-center justify-center bg-gray-200" 
        style={{ height: maxHeight ? `${maxHeight}px` : '400px' }}>
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  // Make image automatically slide in time to the next one
  useEffect(() => {
    if (images.length <= 1) return; // No need for auto-slide if only one image
    
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, [images.length]); // Now images.length is stable thanks to useMemo

  // Reset currentIndex when images change to prevent out-of-bounds index
  useEffect(() => {
    if (currentIndex >= images.length) {
      setCurrentIndex(0);
    }
  }, [images.length, currentIndex]);

  // Reset interval when using the handles to move between images
  const resetInterval = () => {
    if (images.length <= 1) return; // No need for interval if only one image
    
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3000);
  };

  const handleSlide = (index) => {
    setCurrentIndex(index);
    resetInterval();
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length);
    resetInterval();
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    resetInterval();
  };

  return (
    <div className="relative w-full overflow-hidden" 
      style={{ height: maxHeight ? `${maxHeight}px` : '400px' }}>
        {images.map((image, index) => {
          return (
            <div key={index} className={`absolute inset-0 transition-opacity duration-700 ${
                      index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
              <MediaDisplayWithFallback mediaPath={image} mediaType={'image'} alt={`Image ${index + 1}`} fill className="object-cover object-center 
                rounded-md" style={{objectPosition: 'center'}} sizes="100vw, 50vw"
              />
            </div>
          );
        })}

      {images.length > 1 && (
      <>
        {/* Slide handles */}
        <div className="absolute inset-x-0 bottom-0 z-20 mx-[15%] mb-4 flex list-none justify-center p-0 pointer-events-auto">
        {images.map((_, index) => (
          <button key={index} type="button" data-twe-slide-to={index}
            className={`mx-[3px] box-content h-[3px] w-[30px] flex-initial cursor-pointer border-0 border-y-[10px] 
            border-solid border-transparent bg-white hover:bg-blue-500 bg-clip-padding p-0 indent-[999px] opacity-50 
            transition-opacity duration-[600ms] ease-[cubic-bezier(0.25,0.1,0.25,1.0)] motion-reduce:transition-none 
            ${ index === currentIndex ? 'opacity-100 bg-blue-400' : '' }`}
            aria-current={index === currentIndex ? 'true' : 'false'} aria-label={`Slide ${index + 1}`}
            onClick={() => handleSlide(index)} />
        ))}
        </div>

        {/* Arrow handles */}
        {/* Move to previous image */}
        <button onClick={handlePrev} className="absolute inset-y-0 left-0 z-20 flex w-[15%] items-center 
          justify-center border-0 bg-none p-0 text-white opacity-100 hover:opacity-90 duration-150 
          transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1.0)] pointer-events-auto group" type="button">
          <span className="inline-block size-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
              stroke="currentColor" className="size-6 transition-colors duration-150 ease-in-out 
              group-hover:text-blue-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </span>
          <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 
              ![clip:rect(0,0,0,0)]">
            Previous
          </span>
        </button>

        {/* Move to next image */}
        <button onClick={handleNext} className="absolute inset-y-0 right-0 z-20 flex w-[15%] items-center 
          justify-center border-0 bg-none p-0 text-white opacity-100 hover:opacity-90 duration-150 
          transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1.0)] pointer-events-auto group" type="button">
          <span className="inline-block size-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
            stroke="currentColor" className="size-6 transition-colors duration-150 ease-in-out 
              group-hover:text-blue-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </span>
          <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 
              ![clip:rect(0,0,0,0)]">
            Next
          </span>
        </button>
      </>
      )}
    </div>
  );
});

Carrousel.propTypes = {
  lab: PropTypes.shape({
    images: PropTypes.arrayOf(PropTypes.string)
  }).isRequired,
  maxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}

Carrousel.defaultProps = {
  maxHeight: undefined
}

export default Carrousel;
