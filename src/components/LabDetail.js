import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUser } from '../context/UserContext';
import { useLabs } from '../context/LabContext';
import Carrousel from './Carrousel';
import DocsCarrousel from './DocsCarrousel';

export default function LabDetail({ id }) {
  const { isLoggedIn, address, user, isSSO } = useUser();
  const { labs, loading } = useLabs();
  const [lab, setLab] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (labs && labs.length > 0) {
      const currentLab = labs.find((lab) => lab.id == id);
      setLab(currentLab);
    }
  }, [id, labs]);

  if (loading) {
    return <div className="text-center">Loading lab details...</div>;
  }

  if (!lab) {
    return <div className="text-center">Lab not found.</div>
  }

  return (
    <main className="container mx-auto p-6">
      <section className="flex justify-center gap-10">
        {/* Carousel Section */}
        <article className="md:w-1/2 flex flex-col p-4">
          <div className="w-full h-full flex flex-col justify-center">
            <Carrousel lab={lab} />
            <button className="bg-[#715c8c] hover:bg-[#333f63] text-white px-4 py-2 rounded mt-6 
              max-h.45px w-2/3 mx-auto" onClick={() => 
              router.push(`/reservation/${lab.id}`)} aria-label={`Rent ${lab.name}`}>
              Book Lab
            </button>
          </div>
        </article>

        {/* Lab Details Section */}
        <article className="md:w-2/5 mt-4">
          <header>
            <h1 className="text-2xl text-[#caddff] font-bold pb-2 text-center">
              {lab.name}
            </h1>
            <div className="flex justify-center">
              <hr className="mb-2 separator-width w-1/2" />
            </div>
          </header>
          <p className="text-sm text-justify">{lab.description}</p>
          <p className="text-[#335763] font-semibold mt-2">{lab.price} $LAB / hour</p>

          <div className="mt-2">
            {/* Category */}
            <div className="flex items-center">
              <span className="bg-[#3f3363] text-gray-200 inline-flex items-center justify-center 
              py-1 px-3 text-sm rounded" aria-label={`Category: ${lab.category}`}>
                {lab.category}
              </span>
            </div>

            {/* Keywords */}
            <div className="flex flex-wrap gap-2 mt-2">
              {lab.keywords.map((keyword) => (
                <span key={keyword} className="bg-[#335763] text-gray-200 inline-flex items-center 
                  justify-center py-1 px-3 text-sm rounded" aria-label={`Keyword: ${keyword}`}>
                  {keyword}
                </span>
              ))}
            </div>

            {/* Documentation */}
            <div className={`flex flex-col text-center mt-4 overflow-hidden`}>
              <h3 className="text-[#caddff] text-lg font-semibold">
                Documentation
              </h3>
              <div className="transition-opacity duration-300 opacity-100 mt-2">
                {lab.docs && lab.docs.length > 0 ? (
                  <DocsCarrousel docs={lab.docs} />
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