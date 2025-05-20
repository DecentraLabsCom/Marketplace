"use client";
import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { useUser } from '../../context/UserContext';
import { useLabs } from '../../context/LabContext';
import useContractWriteFunction from '../../hooks/contract/useContractWriteFunction';
import useLabFeedback from '../../hooks/useLabFeedback';
import Carrousel from '../../components/Carrousel';
import LabModal from '../../components/LabModal';
import AccessControl from '../../components/AccessControl';
import FeedbackModal from '../../components/FeedbackModal';

export default function ProviderDashboard() {
  const { address, isConnected, isLoggedIn, user, isSSO } = useUser();
  const { labs, setLabs, loading } = useLabs();

  const { contractWriteFunction: addLab, isSuccess: isAddSuccess, 
    error: addError } = useContractWriteFunction('addLab');  
  const { contractWriteFunction: deleteLab, isSuccess: isDeleteSuccess, 
    error: deleteError } = useContractWriteFunction('deleteLab');
  const { contractWriteFunction: updateLab, isSuccess: isUpdateSuccess, 
    error: updateError } = useContractWriteFunction('updateLab');
  const { contractWriteFunction: listLab, isSuccess: isListSuccess, 
    error: listError } = useContractWriteFunction('listLab');
  const { contractWriteFunction: unlistLab, isSuccess: isUnlistSuccess, 
    error: unlistError } = useContractWriteFunction('unlistLab');
  /*const { contractWriteFunction: setTokenURI, isSuccess: isSetTokenSuccess, 
    error: setTokenError } = useContractWriteFunction('setTokenURI');*/

  const [ownedLabs, setOwnedLabs] = useState([]);
  const [editingLab, setEditingLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const newLabStructure = {
    name: '', category: '', keywords: [], price: '', description: '',
    provider: '', auth: '', accessURI: '', accessKey: '', timeSlots: [],
    opens: '', closes: '', docs: [], images: [], uri: ''
  };
  const [newLab, setNewLab] = useState(newLabStructure);

  // Control feedback on success and on error & control action (set labs) on success
  const { setPendingEditingLabs, setPendingDeleteLabs, setPendingNewLab,
    setPendingListLabs, setPendingUnlistLabs,
  } = useLabFeedback({ labs, setLabs,
    setEditingLab, setIsModalOpen, setShowFeedback, setFeedbackTitle, setFeedbackMessage,
    isAddSuccess, isUpdateSuccess, isDeleteSuccess, isListSuccess, isUnlistSuccess,
    addError, updateError, deleteError, listError, unlistError,
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
    if (ownedLabs.length > 0 && !editingLab && !isModalOpen) {
      setEditingLab(ownedLabs[0]);
    }
  }, [ownedLabs, isModalOpen, editingLab]);

  // Handle adding or updating a lab
  const handleSaveLab = async () => {
    let labDataToSave = null;
    let hasChangedOnChainData = true;
    let updatedLabs = [];

    if (editingLab?.id) {
      editingLab.uri = editingLab.uri || `Lab-${user.name}-${editingLab.id}.json`;

      const originalLab = labs.find(lab => lab.id == editingLab.id);

      hasChangedOnChainData =
      originalLab.uri !== editingLab.uri ||
      originalLab.price !== editingLab.price ||
      originalLab.auth !== editingLab.auth ||
      originalLab.accessURI !== editingLab.accessURI ||
      originalLab.accessKey !== editingLab.accessKey;

      if (hasChangedOnChainData) {
        updateLab([
            editingLab.id,
            editingLab.uri,
            editingLab.price,
            editingLab.auth,
            editingLab.accessURI,
            editingLab.accessKey
        ]);
        //await tx.wait();
        // TODO: Disable modal until the transaction is confirmed; maybe show a spinner
      }
      updatedLabs = labs.map((lab) =>
        lab.id == editingLab.id ? editingLab : lab
      );
      setPendingEditingLabs(updatedLabs);
      // Only save lab data if the metadata URI points to a local file.
      if (editingLab.uri.startsWith('Lab-')) {
        labDataToSave = editingLab;
      }
    } else {
      const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;
      newLab.uri = newLab.uri || `Lab-${user.name}-${maxId + 1}.json`;
      addLab([
          newLab.uri,
          newLab.price,
          newLab.auth,
          newLab.accessURI,
          newLab.accessKey
      ]);
      const newLabRecord = { ...newLab, id: maxId + 1, providerAddress: address};
      setPendingNewLab(newLabRecord); 
      // Only save lab data if the metadata URI points to a local file.
      if (newLab.uri.startsWith('Lab-')) {
          labDataToSave = newLabRecord;
      }   
    }

    if (labDataToSave) {
      try {
        const response = await fetch('/api/provider/saveLabData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labData: labDataToSave }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        labDataToSave = null;
        if (!hasChangedOnChainData) {
          setLabs(updatedLabs);
          setFeedbackTitle('Success!');
          setFeedbackMessage('Lab updated successfully.');
          setShowFeedback(true);
          setIsModalOpen(false);
        }
      } catch (error) {
        labDataToSave = null;
        setFeedbackTitle('Error!');
        setFeedbackMessage('Failed to save lab data.');
        setShowFeedback(true);
      }
    }
  };

  // Handle delete a lab
  const handleDeleteLab = async (labId) => {
    const updatedLabs = labs.filter((lab) => lab.id !== labId);
    deleteLab([labId]);
    setPendingDeleteLabs(updatedLabs);

    const labToDelete = labs.find((lab) => lab.id == labId);
    const labURI = labToDelete.uri;
    const imagesToDelete = labToDelete.images;
    const docsToDelete = labToDelete.docs;

    // Delete lab's associated image files
    if (imagesToDelete && Array.isArray(imagesToDelete)) {
      imagesToDelete.forEach(imageToDelete => {
        if (imageToDelete) {
          // Construct filePath relative to /public
          const filePathToDelete = imageToDelete.startsWith('/') ? imageToDelete.substring(1) : imageToDelete;

          fetch('/api/provider/deleteFile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filePath: filePathToDelete }),
          }).then(response => {
            if (!response.ok) {
              console.error('Failed to delete image file:', filePathToDelete);
            }
          }).catch(error => {
            console.error('Error deleting image file:', error);
          });
        }
      });
    } else {
        console.warn('labToDelete.images is not an array or is undefined:', imagesToDelete);
    }

    // Delete lab's associated doc files
    if (docsToDelete && Array.isArray(docsToDelete)) {
      docsToDelete.forEach(docToDelete => {
        if (docToDelete) {
          // Construct filePath relative to /public
          const filePathToDelete = docToDelete.startsWith('/') ? docToDelete.substring(1) : docToDelete;

          fetch('/api/provider/deleteFile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filePath: filePathToDelete }),
          }).then(response => {
            if (!response.ok) {
              console.error('Failed to delete doc file:', filePathToDelete);
            }
          }).catch(error => {
            console.error('Error deleting doc file:', error);
          });
        }
      });
    } else {
        console.warn('labToDelete.docs is not an array or is undefined:', docsToDelete);
    }

    // Delete json file
    try {
      const response = await fetch('/api/provider/deleteLabData', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labURI: labURI }),
        // body: JSON.stringify({ labURI: `Lab-${user.name}-${labId}.json` }),
      });

      if (!response.ok) {
        setShowFeedback(true);
        setFeedbackTitle("Error Deleting JSON file");
        setFeedbackMessage("Failed to delete the associated data file on the server.");
      } else {
        const data = await response.json();
        setShowFeedback(true);
        setFeedbackTitle("Lab Deleted");
        setFeedbackMessage("Lab and its data have been deleted successfully.");
      }
    } catch (error) {
      setShowFeedback(true);
      setFeedbackTitle("Error Deleting JSON file");
      setFeedbackMessage("An error occurred while trying to delete the associated data file.");
    }
  };

  // Handle listing a lab
  const handleList = async (labId) => {
    listLab([labId]);
    setPendingListLabs(labs.map((lab) => (lab.id === labId ? { ...lab, listed: true } : lab)));
  };
  
  // Handle unlisting a lab
  const handleUnlist = async (labId) => {
    unlistLab([labId]);
    setPendingUnlistLabs(labs.map((lab) => (lab.id === labId ? { ...lab, listed: false } : lab)));
  };

  // Handle collecting balances from all labs
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
  
  // Handle collecting balance from a specific lab
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

  const handleSelectChange = (e) => {
    const selectedLabId = e.target.value;
    const selectedLab = ownedLabs.find((lab) => lab.id == selectedLabId);
    console.log('selectedLab id:', selectedLab.uri);
    setEditingLab(selectedLab);
  };

  return (
    <AccessControl requireWallet message="Please log in to manage your labs.">
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
                  className="bg-[#bcc4fc] text-white px-6 py-2 rounded shadow hover:bg-[#aab8e6] 
                            font-bold"
                >
                  Collect All
                </button>
              </div>
              <div className="flex justify-center">
                <select className="w-full p-3 border-2 bg-gray-800 text-white rounded mb-4 max-w-4xl"
                  value={editingLab?.id || ""}
                  onChange={handleSelectChange}
                >
                  <option value="" disabled>
                    Select one of your labs
                  </option>
                  {ownedLabs.filter(lab => !isNaN(lab.id))
                    .map((lab) => (
                      <option key={lab.id} value={lab.id}>
                        {lab.name}
                      </option>
                    ))
                  }
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
                        <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                        border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                      <button onClick={() => handleCollect(editingLab.id)}
                        className="relative bg-[#bcc4fc] h-1/4 overflow-hidden group hover:font-bold"
                      >
                        Collect
                        <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                        border-b-[#94a6cc] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                      <button onClick={() => handleList(editingLab.id)} disabled
                        className="relative bg-[#759ca8] h-1/4 overflow-hidden group hover:font-bold
                                  opacity-50 cursor-not-allowed"
                      >
                        List
                        <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                        border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                      <button onClick={() => handleUnlist(editingLab.id)} disabled
                        className="relative bg-[#7583ab] h-1/4 overflow-hidden group hover:font-bold
                                  opacity-50 cursor-not-allowed"
                      >
                        Unlist
                        <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                        border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                        group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                    </div>
                  </div>
                  <div className="w-2/3 flex justify-center mt-4">
                    <button onClick={() => handleDeleteLab(editingLab.id)}
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
              <p className="text-gray-300 text-center">
                You have no labs registered yet. Press &quot;Add New Lab&quot; to get started.
              </p>
            )}
            <div className="flex justify-center mt-4">
            <button onClick={() => {setEditingLab(null); setNewLab(newLabStructure); setIsModalOpen(true);}}
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

        <FeedbackModal isOpen={showFeedback} title={feedbackTitle} message={feedbackMessage} 
          onClose={() => setShowFeedback(false)} />
      </div>
    </AccessControl>
  );
}