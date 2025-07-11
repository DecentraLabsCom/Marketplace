"use client";
import React, { useState, useEffect, useRef } from 'react';
import MediaDisplayWithFallback from '@/components/MediaDisplayWithFallback';

const Carrousel = React.memo(function Carrousel({ lab, maxHeight }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef(null);

  // Make image automatically slide in time to the next one
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % lab.images.length);
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, [lab?.images?.length]);

  // Reset interval when using the handles to move between images
  const resetInterval = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % lab.images.length);
    }, 3000);
  };

  const handleSlide = (index) => {
    setCurrentIndex(index);
    resetInterval();
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + lab.images.length) % lab.images.length);
    resetInterval();
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % lab.images.length);
    resetInterval();
  };

  return (
    <div className="relative w-full overflow-hidden" 
      style={{ height: maxHeight ? `${maxHeight}px` : '400px' }}>
        {lab?.images.filter((image) => !!image).map((image, index) => {

          return (
            <div key={index} className={`absolute inset-0 transition-opacity duration-700 ${
                      index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
              <MediaDisplayWithFallback mediaPath={image} mediaType={'image'} alt={`Image ${index + 1}`} fill className="object-cover object-center 
                rounded-md" style={{objectPosition: 'center'}} sizes="100vw, 50vw"
              />
            </div>
          );
        })}

      {lab?.images.length > 1 && (
      <>
        {/* Slide handles */}
        <div className="absolute inset-x-0 bottom-0 z-20 mx-[15%] mb-4 flex list-none justify-center p-0 pointer-events-auto">
        {lab.images.map((_, index) => (
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

export default Carrousel;