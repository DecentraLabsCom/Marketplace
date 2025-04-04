import { useState, useEffect, useRef } from 'react';

export default function Carrousel({ lab, maxHeight }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef(null);

  // Make image automatically slide in time to the next one
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % lab.image.length);
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, [lab?.image?.length]);

  // Reset interval when using the handles to move between images
  const resetInterval = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % lab.image.length);
    }, 3000);
  };

  const handleSlide = (index) => {
    setCurrentIndex(index);
    resetInterval();
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + lab.image.length) % lab.image.length);
    resetInterval();
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % lab.image.length);
    resetInterval();
  };

  return (
    <div className={`relative w-full ${maxHeight ? `h-[${maxHeight}px]` : 'h-[400px]'} overflow-hidden`}>
        {lab?.image.map((image, index) => (
          <div
            key={index}
            className={`relative float-left -mr-[100%] w-full transition-opacity duration-[600ms] 
              ease-in-out motion-reduce:transition-none ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {image && (
              <img src={image} alt={`Image ${index + 1}`} 
              className={`w-full ${maxHeight ? `h-[${maxHeight}px]` : 'h-[400px]'} object-cover 
              object-center rounded-md`} style={{ objectPosition: 'center' }} />
            )}
          </div>
        ))}

      {/* Slide handles */}
      <div
        className="absolute inset-x-0 bottom-0 z-[2] mx-[15%] mb-4 flex list-none justify-center p-0"
      >
        {lab.image.map((_, index) => (
          <button
            key={index}
            type="button"
            data-twe-slide-to={index}
            className={`mx-[3px] box-content h-[3px] w-[30px] flex-initial cursor-pointer border-0 border-y-[10px] 
              border-solid border-transparent bg-white hover:bg-blue-500 bg-clip-padding p-0 -indent-[999px] opacity-50 
              transition-opacity duration-[600ms] ease-[cubic-bezier(0.25,0.1,0.25,1.0)] motion-reduce:transition-none ${
              index === currentIndex ? 'opacity-100 bg-blue-400' : ''
            }`}
            aria-current={index === currentIndex ? 'true' : 'false'}
            aria-label={`Slide ${index + 1}`}
            onClick={() => handleSlide(index)}
          ></button>
        ))}
      </div>

      {/* Arrow handles */}
      {/* Move to previous image */}
      <button onClick={handlePrev} className="absolute bottom-0 left-0 top-0 z-[1] flex w-[15%] items-center 
        justify-center border-0 bg-none p-0 text-center text-white opacity-50 transition-opacity duration-150 
        ease-[cubic-bezier(0.25,0.1,0.25,1.0)] hover:text-blue-500 hover:no-underline hover:opacity-90 
        hover:outline-none focus:text-white focus:no-underline focus:opacity-90 focus:outline-none 
        motion-reduce:transition-none" type="button">
        <span className="inline-block h-8 w-8">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
          stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </span>
        <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 
            !p-0 ![clip:rect(0,0,0,0)]">Previous</span>
      </button>

      {/* Move to next image */}
      <button onClick={handleNext} className="absolute bottom-0 right-0 top-0 z-[1] flex w-[15%] items-center 
        justify-center border-0 bg-none p-0 text-center text-white opacity-50 transition-opacity duration-150 
        ease-[cubic-bezier(0.25,0.1,0.25,1.0)] hover:text-blue-500 hover:no-underline hover:opacity-90 
        hover:outline-none focus:text-white focus:no-underline focus:opacity-90 focus:outline-none 
        motion-reduce:transition-none" type="button">
        <span className="inline-block h-8 w-8">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" 
          stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </span>
        <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 
            !p-0 ![clip:rect(0,0,0,0)]">Next</span>
      </button>
    </div>
  );
}
