"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAllLabsQuery } from '@/hooks/useLabs';
import { useLabToken } from '@/hooks/useLabToken';
import Carrousel from '@/components/Carrousel';
import DocsCarrousel from '@/components/DocsCarrousel';
import { LabHeroSkeleton } from '@/components/skeletons';

export default function LabDetail({ id, provider }) {
  const { 
    data: labs = [], 
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsQuery({
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
  const { formatPrice } = useLabToken();
  const [lab, setLab] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (labs && labs.length > 0) {
      const currentLab = labs.find((lab) => lab.id == id);
      setLab(currentLab);
    }
  }, [id, labs]);

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <main className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Lab</h2>
          <p className="text-red-600 mb-4">
            {labsErrorDetails?.message || 'Failed to load laboratory data'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="container mx-auto p-6">
        <LabHeroSkeleton />
      </main>
    );
  }

  if (!lab) {
    return <div className="text-center">Lab not found.</div>
  }

  return (
    <main className="container mx-auto p-6">
      <section className="flex flex-col md:flex-row md:justify-center gap-6 md:gap-10">
        {/* Carousel Section */}
        <article className="w-full md:w-1/2 flex flex-col p-4">
          <div className="size-full flex flex-col justify-center">
            <Carrousel lab={lab} />
            <button className="bg-[#715c8c] hover:bg-[#333f63] text-white px-4 py-2 rounded mt-6 
              max-h-[45px] w-2/3 mx-auto" onClick={() => 
              router.push(`/reservation/${lab?.id}`)} aria-label={`Rent ${lab?.name}`}>
              Book Lab
            </button>
          </div>
        </article>

        {/* Lab Details Section */}
        <article className="w-full md:w-2/5 mt-4">
          <header>
            <h1 className="text-2xl text-[#caddff] font-bold pb-2 text-center">
              {lab?.name}
            </h1>
            <div className="flex justify-center">
              <hr className="mb-2 separator-width w-1/2" />
            </div>
          </header>
          <p className="text-sm text-justify">{lab?.description}</p>
          <p className="flex justify-between items-center text-[#335763] font-semibold mt-2">
            <span>{formatPrice(lab?.price)} $LAB / hour</span>
            {provider && (
              <span className="truncate max-w-[50%]" title={provider}>
                Provider: {provider}
              </span>
            )}
          </p>

          <div className="mt-2">
            {/* Category */}
            <div className="flex items-center">
              <span className="bg-[#3f3363] text-gray-200 inline-flex items-center justify-center 
              py-1 px-3 text-sm rounded" aria-label={`Category: ${lab?.category}`}>
                {lab?.category}
              </span>
            </div>

            {/* Keywords */}
            <div className="flex flex-wrap gap-2 mt-2">
              {(Array.isArray(lab.keywords) ? lab.keywords : []).map((keyword) => (
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
    </main>
  )
}
