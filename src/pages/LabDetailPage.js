import { useState, useEffect } from 'react'
import { useLabs } from '../context/LabContext';
import Carrousel from '../components/Carrousel';
import { useRouter } from 'next/router';


export default function LabDetailPage({ id }) {
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
    <main className="container mx-auto p-6 mt-8">
      <section className="flex flex-col md:flex-row gap-6">
        {/* Carousel Section */}
        <article className="md:w-1/2 flex flex-col items-center justify-center p-4">
          <div className="w-full h-[400px] flex items-center justify-center">
            <div className="w-full h-full">
              <Carrousel lab={lab} />
            </div>
          </div>
        </article>

        {/* Lab Details Section */}
        <article className="md:w-2/5 md:ml-4 mt-3">
          <header>
            <h1 className="text-2xl font-bold pb-2 text-center">{lab.name}</h1>
            <div className="flex justify-center">
              <hr className="mb-2 separator-width w-1/2" />
            </div>
          </header>
          <p className="text-gray-400 text-sm text-justify">{lab.description}</p>
          <p className="text-blue-600 font-semibold mt-2">{lab.price} ETH</p>
          <button
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded mt-3 w-full"
            onClick={() => router.push(`/reservation/${lab.id}`)} aria-label={`Rent ${lab.name}`}>
            Rent Lab
          </button>
          <div className="flex flex-col mt-4 space-y-2">
          {/* Category */}
          <div className="flex items-center">
            <span
              className="bg-red-700 text-gray-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded"
              aria-label={`Category: ${lab.category}`}
            >
              {lab.category}
            </span>
          </div>

          {/* Keywords */}
          <div className="flex flex-wrap gap-2">
            {lab.keywords.map((keyword) => (
              <span
                key={keyword}
                className="bg-yellow-700 text-gray-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded"
                aria-label={`Keyword: ${keyword}`}
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
        </article>
      </section>
    </main>
  )
}
