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
        <div className='md:w-4/5 '><Carrousel lab={lab} /></div>
        <div className="md:w-2/5 md:ml-4">
          <h2 className="text-lg font-bold mt-2">{lab.name}</h2>
          <p className="text-gray-400 text-sm text-justify">{lab.description}</p>
          <p className="text-blue-600 font-semibold mt-2">{lab.price} ETH</p>
          <button className="bg-green-600 text-white px-4 py-2 rounded mt-3 
          w-full disabled:opacity-50">
            Rent Lab
          </button>
        </div>
      </div>
    </div>
  )
}
