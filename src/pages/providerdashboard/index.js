import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { useUser } from '../../context/UserContext';
import { useLabs } from '../../context/LabContext';
import Carrousel from '../../components/Carrousel';
import LabModal from '../../components/LabModal';
import AccessControl from '../../components/AccessControl';
import FeedbackModal from '../../components/FeedbackModal';

export default function ProviderDashboard() {
  const { address, isLoggedIn, user, isSSO } = useUser();
  const { labs, loading, setLabs } = useLabs();
  const [isMounted, setIsMounted] = useState(false);
  const [ownedLabs, setOwnedLabs] = useState([]);
  const [editingLab, setEditingLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [newLab, setNewLab] = useState({
    name: '',
    category: '',
    keywords: [],
    price: '',
    description: '',
    provider: '',
    auth: '',
    accessURI: '',
    accessKey: '',
    timeSlots: [],
    opens: '',
    closes: '',
    docs: [],
    images: [],
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const today = new Date();

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

  useEffect(() => { setIsMounted(true); }, []);
  if (!isMounted) return null;

  // Handle unregister/delist a lab
  const handleUnregisterLab = (labId) => {
    const updatedLabs = labs.filter((lab) => lab.id !== labId);
    setLabs(updatedLabs);
    setFeedbackMessage('Lab deleted successfully.');
    setShowFeedback(true);
  };

  // Handle adding or updating a lab
  const handleSaveLab = () => {
    if (editingLab?.id) {
      const updatedLabs = labs.map((lab) =>
        lab.id === editingLab.id ? editingLab : lab
      );
      setLabs(updatedLabs);
      setFeedbackMessage('Lab updated successfully.');

    } else {
      const newLabWithId = { ...newLab, id: Date.now(), providerAddress: address };
      setLabs([...labs, newLabWithId]);
      setFeedbackMessage('Lab added successfully.');
    }
    setShowFeedback(true);
    setEditingLab(null);
    setIsModalOpen(false);
  };

  const handleCollectAll = async () => {
    try {
      const res = await fetch('/api/contract/reservation/claimAllBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error('Failed to collect balance');
      setFeedbackMessage('All balances collected successfully.');
      setShowFeedback(true);
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleCollect = async (labId) => {
    try {
      const res = await fetch('/api/contract/reservation/claimLabBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, labId }),
      });
      if (!res.ok) throw new Error('Failed to collect balance');
      setFeedbackMessage('Balance collected successfully.');
      setShowFeedback(true);
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleList = async (labId) => {
    try {
      const res = await fetch('/api/contract/lab/listLab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, labId }),
      });
      if (!res.ok) throw new Error('Failed to list lab');
      setFeedbackMessage('Lab listed successfully.');
      setShowFeedback(true);
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleUnlist = async (labId) => {
    try {
      const res = await fetch('/api/contract/lab/unlistLab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, labId }),
      });
      if (!res.ok) throw new Error('Failed to unlist lab');
      setFeedbackMessage('Lab unlisted successfully.');
      setShowFeedback(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AccessControl message="Please log in to manage your labs.">
      <div className="container mx-auto p-4">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">Lab Panel</h1>
        </div>

        <div className="flex flex-col md:flex-row">

          <div className="w-full md:w-2/3">
            <h2 className="text-xl font-semibold mb-4 text-center">Your Labs</h2>
            {loading ? (
              <p className="text-gray-300 text-center">Loading labs...</p>
            ) : ownedLabs.length > 0 ? (
              <>
              <div className="flex justify-center mb-4">
                <button onClick={handleCollectAll}
                  className="bg-[#bcc4fc] text-white px-6 py-2 rounded shadow hover:bg-[#aab8e6] font-bold"
                >
                  Collect All
                </button>
              </div>
              <div className="flex justify-center">
                <select className="w-full p-3 border-2 bg-gray-800 text-white rounded mb-4 max-w-4xl"
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
                      <button onClick={() => setIsModalOpen(true)}
                        className="relative bg-[#715c8c] h-1/4 overflow-hidden group hover:font-bold"
                      >
                        Edit
                        <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                        border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                      <button onClick={() => handleCollect(editingLab.id)}
                        className="relative bg-[#bcc4fc] h-1/4 overflow-hidden group hover:font-bold"
                      >
                        Collect
                        <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                        border-b-[#94a6cc] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                      <button onClick={() => handleList(editingLab.id)}
                        className="relative bg-[#759ca8] h-1/4 overflow-hidden group hover:font-bold"
                      >
                        List
                        <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                        border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                      <button onClick={() => handleUnlist(editingLab.id)}
                        className="relative bg-[#7583ab] h-1/4 overflow-hidden group hover:font-bold"
                      >
                        Unlist
                        <span className="absolute bottom-0 right-0 w-0 h-0 border-b-[3.15em] 
                        border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                    </div>
                  </div>
                  <div className="w-2/3 flex justify-center mt-4">
                    <button onClick={() => handleUnregisterLab(editingLab.id)}
                      className="bg-[#a87583] text-white w-20 py-2 rounded hover:font-bold 
                      hover:bg-[#8a5c66]"
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

          <div className="w-full md:w-1/3 mt-8 md:mt-0">
            <h2 className="text-xl font-semibold mb-4 text-center">Upcoming Lab Reservations</h2>
            <div className="flex justify-center">
              <DatePicker inline selected={selectedDate} minDate={today} onChange={setSelectedDate} 
                calendarClassName="custom-datepicker" filterDate={() => false} />
            </div>
          </div>
          
        </div>

        <LabModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSaveLab}
          lab={editingLab || newLab} setLab={editingLab ? setEditingLab : setNewLab} />

        <FeedbackModal isOpen={showFeedback} message={feedbackMessage} onClose={() => setShowFeedback(false)} />
      </div>
    </AccessControl>
  );
}