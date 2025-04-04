import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { useLabs } from '../context/LabContext';
import Carrousel from '../components/Carrousel';
import LabModal from '../components/LabModal';

export default function ProviderDashboard() {
  const { address } = useAccount();
  const { labs, loading, setLabs } = useLabs(); // Assuming `setLabs` is exposed in LabContext
  const [ownedLabs, setOwnedLabs] = useState([]);
  const [editingLab, setEditingLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLab, setNewLab] = useState({
    name: '',
    category: '',
    price: '',
    description: '',
    provider: '',
    auth: '',
    image: [],
    keywords: [],
    docs: [],
  });

  // Filter labs owned by the user
  useEffect(() => {
    if (address && labs) {
      const userLabs = labs.filter((lab) => lab.providerAddress === String(address));
      setOwnedLabs(userLabs);
    }
  }, [address, labs]);

  // Handle unregister/delist a lab
  const handleUnregisterLab = (labId) => {
    const updatedLabs = labs.filter((lab) => lab.id !== labId);
    setLabs(updatedLabs);
  };

  // Handle adding or updating a lab
  const handleSaveLab = () => {
    if (editingLab?.id) {
      const updatedLabs = labs.map((lab) =>
        lab.id === editingLab.id ? editingLab : lab
      );
      setLabs(updatedLabs);
    } else {
      const newLabWithId = { ...newLab, id: Date.now(), providerAddress: address };
      setLabs([...labs, newLabWithId]);
    }
    setEditingLab(null);
    setIsModalOpen(false);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">Lab Panel</h1>
      </div>

      <div className="flex">

        <div className="w-2/3">
          <h2 className="text-xl font-semibold mb-4 text-center">Your Labs</h2>
          {loading ? (
            <p className="text-gray-300 text-center">Loading labs...</p>
          ) : ownedLabs.length > 0 ? (
            <ul className="space-y-4 max-w-4xl mx-auto">
              {ownedLabs.map((lab) => (
                <li key={lab.id} className="p-4 border rounded shadow flex-col">
                  <div className="flex flex-col items-stretch justify-between">
                      <h3 className="w-2/3 text-lg font-bold text-center">
                        {lab.name}
                      </h3>
                      <div className="w-full flex">
                        <div className="w-2/3">
                          <Carrousel lab={lab} maxHeight={200} />
                        </div>
                        <div className="h-[200px] ml-6 flex flex-col flex-1 items-stretch text-white">
                          <button onClick={() => { setEditingLab(lab); setIsModalOpen(true); }}
                              className="relative bg-[#715c8c] h-1/4 overflow-hidden group hover:font-bold">
                            Edit
                            <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                            border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                            group-hover:opacity-100 transition-opacity duration-300"></span>
                          </button>
                          <button onClick={() => { }}
                              className="relative bg-[#bcc4fc] h-1/4 overflow-hidden group hover:font-bold">
                            Collect
                            <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                            border-b-[#94a6cc] border-l-[7em] border-l-transparent opacity-0 
                            group-hover:opacity-100 transition-opacity duration-300"></span>
                          </button>
                          <button onClick={() => { }}
                              className="relative bg-[#759ca8] h-1/4 overflow-hidden group hover:font-bold">
                            List
                            <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                            border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                            group-hover:opacity-100 transition-opacity duration-300"></span>
                          </button>
                          <button onClick={() => { }}
                              className="relative bg-[#7583ab] h-1/4 overflow-hidden group hover:font-bold">
                            Unlist
                            <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                            border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                            group-hover:opacity-100 transition-opacity duration-300"></span>
                          </button>
                        </div>
                      </div>
                      <div className="w-2/3 flex justify-center">
                        <button onClick={() => handleUnregisterLab(lab.id)}
                                className="bg-[#a87583] text-white w-20 py-2 rounded mt-4 
                                hover:font-bold hover:bg-[#8a5c66]">
                          Delete
                        </button>
                      </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-300">
              You have no labs registered yet. Press "Add New Lab" to get started.
            </p>
          )}
        </div>

        <div className="w-1/3">
          <h2 className="text-xl font-semibold mb-4 text-center">Upcoming Lab Reservations</h2>
        </div>
        
      </div>

      <button
        onClick={() => {
          setEditingLab(null);
          setIsModalOpen(true);
        }}
        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#7b976e] text-white 
        px-6 py-3 rounded-full shadow-lg hover:bg-[#83a875]"
      >
        Add New Lab
      </button>

      <LabModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveLab}
        lab={editingLab || newLab}
        setLab={editingLab ? setEditingLab : setNewLab}
      />
    </div>
  );
}