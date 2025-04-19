import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { useLabs } from '../../context/LabContext';
import Carrousel from '../../components/Carrousel';
import LabModal from '../../components/LabModal';

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

  // Automatically set the first lab as the selected lab
  useEffect(() => {
    if (ownedLabs.length > 0 && !editingLab) {
      setEditingLab(ownedLabs[0]);
    }
  }, [ownedLabs]);

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
            <>
            <div className="flex justify-center">
              <select
                className="w-full p-3 border-2 bg-gray-800 text-white rounded mb-4 max-w-4xl"
                value={editingLab?.id || ""}
                onChange={(e) => {
                  const selectedLab = ownedLabs.find((lab) => lab.id === parseInt(e.target.value));
                  setEditingLab(selectedLab || null);
                }}
              >
                <option value="" disabled>
                  Select one of your labs
                </option>
                {ownedLabs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </select>
            </div>
            {editingLab && (
              <div className="p-4 border rounded shadow max-w-4xl mx-auto">
                <h3 className="text-lg font-bold text-center mb-4">{editingLab.name}</h3>
                <div className="w-full flex">
                  <div className="w-2/3">
                    <Carrousel lab={editingLab} maxHeight={200} />
                  </div>
                  <div className="h-[200px] ml-6 flex flex-col flex-1 items-stretch text-white">
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="relative bg-[#715c8c] h-1/4 overflow-hidden group hover:font-bold"
                    >
                      Edit
                      <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                      border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300"></span>
                    </button>
                    <button
                      onClick={() => {}}
                      className="relative bg-[#bcc4fc] h-1/4 overflow-hidden group hover:font-bold"
                    >
                      Collect
                      <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                      border-b-[#94a6cc] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300"></span>
                    </button>
                    <button
                      onClick={() => {}}
                      className="relative bg-[#759ca8] h-1/4 overflow-hidden group hover:font-bold"
                    >
                      List
                      <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                      border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300"></span>
                    </button>
                    <button
                      onClick={() => {}}
                      className="relative bg-[#7583ab] h-1/4 overflow-hidden group hover:font-bold"
                    >
                      Unlist
                      <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                      border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                      group-hover:opacity-100 transition-opacity duration-300"></span>
                    </button>
                  </div>
                </div>
                <div className="w-2/3 flex justify-center mt-4">
                  <button
                    onClick={() => handleUnregisterLab(editingLab.id)}
                    className="bg-[#a87583] text-white w-20 py-2 rounded hover:font-bold hover:bg-[#8a5c66]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
            </>
          ) : (
            <p className="text-gray-300">
              You have no labs registered yet. Press "Add New Lab" to get started.
            </p>
          )}
          <div className="flex justify-center mt-4">
            <button onClick={() => { setEditingLab(null); setIsModalOpen(true); }}
              className="px-6 py-3 rounded shadow-lg bg-[#7b976e] text-white hover:bg-[#83a875]">
              Add New Lab
            </button>
          </div>
        </div>

        <div className="w-1/3">
          <h2 className="text-xl font-semibold mb-4 text-center">Upcoming Lab Reservations</h2>
        </div>
        
      </div>

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