import { useState, useEffect, useRef } from 'react'
import { useLabs } from '../context/LabContext';
import Carrousel from '../components/Carrousel';
import { useRouter } from 'next/router';
import DocsCarrousel from '../components/DocsCarrousel';


export default function LabDetailPage({ id }) {
  const { labs, loading } = useLabs();
  const [lab, setLab] = useState(null);
  const router = useRouter();
  const [isDocsVisible, setIsDocsVisible] = useState(false);
  const docsSectionRef = useRef(null);

  const toggleDocsVisibility = () => {
    setIsDocsVisible(!isDocsVisible);
  };

  useEffect(() => {
    if (labs && labs.length > 0) {
      const currentLab = labs.find((lab) => lab.id == id);
      setLab(currentLab);
    }
  }, [id, labs, isDocsVisible]);

  // Move the main page scrollbar when opening and closing the documentation section
  useEffect(() => {
    if (isDocsVisible && docsSectionRef.current) {
      docsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (docsSectionRef.current) {
      // When closing, scroll to the top of the page
      window.scrollTo({ top: -5, behavior: 'smooth' });
    }
  }, [isDocsVisible]);

  if (loading) {
    return <div className="text-center">Loading lab details...</div>;
  }

  if (!lab) {
    return <div className="text-center">Lab not found.</div>
  }

  return (
    <main className="container mx-auto p-6">
      <section className="flex flex-col justify-center md:flex-row gap-6 md:align-items-start">
        {/* Carousel Section */}
        <article className="md:w-1/2 flex flex-col justify-center p-4">
          <div className="w-full h-full flex flex-col justify-center">
            <Carrousel lab={lab} />
            <button
            className="bg-[#715c8c] hover:bg-[#333f63] text-white px-4 py-2 rounded mt-3 max-h.45px w-full"
            onClick={() => router.push(`/reservation/${lab.id}`)} aria-label={`Rent ${lab.name}`}>
            Rent Lab
          </button>
          </div>
        </article>

        {/* Lab Details Section */}
        <article className="md:w-2/5 md:ml-4 mt-4">
          <header>
            <h1 className="text-2xl font-bold pb-2 text-center">{lab.name}</h1>
            <div className="flex justify-center">
              <hr className="mb-2 separator-width w-1/2" />
            </div>
          </header>
          <p className="text-gray-300 text-sm text-justify">{lab.description}</p>
          <p className="text-[#335763] font-semibold mt-2">{lab.price} $LAB / hour</p>

          <div className="mt-4 space-y-2">
            {/* Category */}
            <div className="flex items-center">
              <span
                className="bg-[#3f3363] text-gray-200 inline-flex items-center justify-center py-1 px-3 
                text-sm rounded" aria-label={`Category: ${lab.category}`}
              >
                {lab.category}
              </span>
            </div>

            {/* Keywords */}
            <div className="flex flex-wrap gap-2">
              {lab.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="bg-[#335763] text-gray-200 inline-flex items-center justify-center py-1 px-3 
                  text-sm rounded" aria-label={`Keyword: ${keyword}`}
                >
                  {keyword}
                </span>
              ))}
            </div>

            {/* Documentation */}
            <div
              ref={docsSectionRef}
              className={`flex-1 mb-4 flex flex-col text-center rounded shadow-md bg-gray-300 
                hover:bg-gray-500 hover:text-white  text-gray-700 overflow-hidden transition-height duration-3  00 ease-in-out `}
              style={{
                height: isDocsVisible ? 'auto' : '45px',
              }}
            >
              <h3
                className="text-lg font-semibold cursor-pointer p-2"
                onClick={toggleDocsVisibility}
              >
                Documentation
              </h3>
              <div
                className={`transition-opacity duration-300 ${
                  isDocsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {lab.docs && lab.docs.length > 0 ? (
                  <DocsCarrousel lab={lab} />
                ) : (
                  <span className="text-center p-2">No documents available</span>
                )}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}
