import { useState, useEffect } from 'react'
import { useLabs } from '../context/LabContext';
import Carrousel from '@/components/Carrousel'

export default function LabDetailPage({ id }) {
  const { labs, loading } = useLabs();
  const [lab, setLab] = useState(null);

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
    <div className=" container mx-auto p-10">
      <div className='flex flex-col md:flex-row'>
        <div className='md:w-4/5'><Carrousel lab={lab} /></div>
        <div className="md:w-2/5 md:ml-4">
          <h2 className="text-2xl font-bold pb-2 text-center">{lab.name}</h2>
          <div className='flex justify-center'><hr className='mb-2 separator-width w-1/2'></hr></div>
          <p className="text-gray-400 text-sm text-justify">{lab.description}</p>
          <p className="text-blue-600 font-semibold mt-2">{lab.price} ETH</p>
          <button className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded mt-3 
          w-full disabled:opacity-50">
            Rent Lab
          </button>
          <div className='flex flex-col'>
            <div className='flex flex-row'>
              <p className='bg-red-700 text-gray-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded mt-3 mx-1'>
                {lab.category}
              </p>
            </div>
            <div className='flex flex-row flex-wrap'>
              {lab.keywords.map((keyword) => (
                <p key={keyword} className='bg-yellow-700 text-gray-200 inline-flex items-center justify-center py-1 px-3 text-sm rounded mt-3 mx-1'>
                  {keyword}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
