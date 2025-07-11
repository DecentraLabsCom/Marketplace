"use client";
import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { useUser } from '@/context/UserContext';
import { useLabs } from '@/context/LabContext';
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction';
import { useWaitForTransactionReceipt } from 'wagmi';
import LabModal from '@/components/LabModal';
import AccessControl from '@/components/AccessControl';
import FeedbackModal from '@/components/FeedbackModal';
import ProviderLabItem from '@/components/ProviderLabItem';
import { renderDayContents } from '@/utils/labBookingCalendar';

export default function ProviderDashboard() {
  const { address, isConnected, isLoggedIn, user, isSSO } = useUser();
  const { labs, setLabs, loading } = useLabs();

  // Contract write functions
  const { contractWriteFunction: addLab } = useContractWriteFunction('addLab');  
  const { contractWriteFunction: deleteLab } = useContractWriteFunction('deleteLab');
  const { contractWriteFunction: updateLab } = useContractWriteFunction('updateLab');
  const { contractWriteFunction: listLab } = useContractWriteFunction('listLab');
  const { contractWriteFunction: unlistLab } = useContractWriteFunction('unlistLab');

  // Transaction state management
  const [lastTxHash, setLastTxHash] = useState(null);
  const [txType, setTxType] = useState(null); // 'add', 'update', 'delete', 'list', 'unlist'
  const [pendingData, setPendingData] = useState(null);
  const [notification, setNotification] = useState(null);

  // Wait for transaction receipt
  const { 
    data: receipt, 
    isLoading: isWaitingForReceipt, 
    isSuccess: isReceiptSuccess 
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  });

  const [ownedLabs, setOwnedLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
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
  const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;

  // Handle transaction confirmation
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType && pendingData) {
      console.log(`Transaction confirmed: ${txType}`, receipt.transactionHash);
      
      setNotification({
        type: 'success',
        message: `✅ ${txType.charAt(0).toUpperCase() + txType.slice(1)} operation confirmed onchain!`,
        hash: receipt.transactionHash
      });
      
      // Handle different transaction types
      switch(txType) {
        case 'add':
          setLabs([...labs, pendingData]);
          setIsModalOpen(false);
          break;
        case 'update':
          setLabs(labs.map(lab => lab.id === pendingData.id ? pendingData : lab));
          setIsModalOpen(false);
          break;
        case 'delete':
          setLabs(labs.filter(lab => lab.id !== pendingData.id));
          break;
        case 'list':
        case 'unlist':
          setLabs(labs.map(lab => lab.id === pendingData.id ? pendingData : lab));
          break;
      }
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
      
      // Auto-hide notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, labs, setLabs]);

  const dayContents = (day, currentDateRender) =>
    renderDayContents({
      day,
      currentDateRender,
      bookingInfo: bookedDates // bookedDates ya es un array de objetos con labName, date, time, minutes, etc.
    });

  const selectedLab = ownedLabs.find(lab => String(lab.id) === String(selectedLabId));

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());
  const [bookedDates, setBookedDates] = useState([]);

  // Filter labs owned by the user
  useEffect(() => {
    if (address && labs) {
      const userLabs = labs.filter((lab) => lab.providerAddress === String(address));
      setOwnedLabs(userLabs);
    }
  }, [address, labs]);

  useEffect(() => {
    if (ownedLabs) {
      const allBookingsDetails = [];

      ownedLabs.forEach(lab => {
        if (Array.isArray(lab.bookingInfo)) {
          lab.bookingInfo.forEach(booking => {
            try {
              const bookingDateObject = new Date(booking.date);

              if (!isNaN(bookingDateObject.getTime()) && bookingDateObject.getTime() >= today.getTime()) {
                // Convert date to string YYYY-MM-DD for tooltip
                const yyyy = bookingDateObject.getFullYear();
                const mm = String(bookingDateObject.getMonth() + 1).padStart(2, '0');
                const dd = String(bookingDateObject.getDate()).padStart(2, '0');
                const dateString = `${yyyy}-${mm}-${dd}`;

                allBookingsDetails.push({
                  labId: lab.id,
                  labName: lab.name,
                  date: bookingDateObject,
                  time: booking.time,
                  minutes: booking.minutes,
                  dateString,
                });
              }
            } catch (error) {
              console.error("Error converting date in lab:", lab.name, booking.date, error);
            }
          });
        }
      });
      setBookedDates(allBookingsDetails);
    }
  }, [ownedLabs, today.toDateString()]);

  // Automatically set the first lab as the selected lab
  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen) {
      setSelectedLabId(ownedLabs[0].id);
    }
  }, [ownedLabs, selectedLabId, isModalOpen]);

  // Handle saving a lab (either when editing an existing one or adding a new one)
  const handleSaveLab = async (labData) => {
    if (labData.id) {
      await handleEditLab({ labData });
    } else {
      await handleAddLab({ labData });
    }
  };

  // Handle editing/updating a lab
  async function handleEditLab({ labData }) {
    labData.uri = labData.uri || `Lab-${user.name}-${labData.id}.json`;
    const originalLab = labs.find(lab => lab.id == labData.id);

    const wasLocalJson = originalLab.uri && originalLab.uri.startsWith('Lab-');
    const isNowExternal = labData.uri && (labData.uri.startsWith('http://') || 
                          labData.uri.startsWith('https://'));
    const mustDeleteOldJson = wasLocalJson && isNowExternal;

    const hasChangedOnChainData =
      originalLab.uri !== labData.uri ||
      originalLab.price !== labData.price ||
      originalLab.auth !== labData.auth ||
      originalLab.accessURI !== labData.accessURI ||
      originalLab.accessKey !== labData.accessKey;

    try {
      // 1. Update lab data
      if (hasChangedOnChainData) {
        // 1a. If there is any change in the on-chain data, update blockchain
        setNotification({
          type: 'pending',
          message: '⏳ Updating lab onchain...'
        });

        let txHash;
        
        if (isSSO) {
          // For SSO users, use server-side transaction with unique provider wallet
          const response = await fetch('/api/contract/lab/updateLabSSO', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              email: user.email,
              labId: labData.id,
              labData: {
                uri: labData.uri,
                price: labData.price,
                auth: labData.auth,
                accessURI: labData.accessURI,
                accessKey: labData.accessKey
              }
            }),
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update lab');
          }
          
          const result = await response.json();
          txHash = result.txHash;
        } else {
          // For wallet users, use client-side transaction
          txHash = await updateLab([
            labData.id,
            labData.uri,
            labData.price,
            labData.auth,
            labData.accessURI,
            labData.accessKey
          ]);
        }
        
        if (txHash) {
          setLastTxHash(txHash);
          setTxType('update');
          setPendingData(labData);
        } else {
          throw new Error('No transaction hash received');
        }
      } else {
        // 1b. If there is no change in the on-chain data, just update the local state
        setLabs(labs.map((lab) => lab.id == labData.id ? { ...labData } : lab));
        setIsModalOpen(false);
        setNotification({
          type: 'success',
          message: '✅ Lab updated successfully (offchain changes only)!'
        });
        setTimeout(() => setNotification(null), 3000);
      }

      // 2. Save the JSON if necessary
      if (labData.uri.startsWith('Lab-')) {
        try {
          const response = await fetch('/api/provider/saveLabData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labData }),
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
          setNotification({
            type: 'error',
            message: '❌ Failed to save lab data.'
          });
          setTimeout(() => setNotification(null), 5000);
          return;
        }
      }

      // 3. Delete the old JSON if necessary
      if (mustDeleteOldJson) {
        await fetch('/api/provider/deleteLabData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labURI: originalLab.uri }),
        });
      }
    } catch (error) {
      console.error('Error updating lab:', error);
      setNotification({
        type: 'error',
        message: `❌ Failed to update lab: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => setNotification(null), 5000);
    }
  }

  // Handle adding a new lab
  async function handleAddLab({ labData }) {
    const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;
    labData.uri = labData.uri || `Lab-${user.name}-${maxId + 1}.json`;

    try {
      setNotification({
        type: 'pending',
        message: '⏳ Adding lab onchain...'
      });

      let txHash;
      
      if (isSSO) {
        // For SSO users, use server-side transaction with unique provider wallet
        const response = await fetch('/api/contract/lab/createLabSSO', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: user.email,
            labData: {
              uri: labData.uri,
              price: labData.price,
              auth: labData.auth,
              accessURI: labData.accessURI,
              accessKey: labData.accessKey
            }
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create lab');
        }
        
        const result = await response.json();
        txHash = result.txHash;
      } else {
        // For wallet users, use client-side transaction
        txHash = await addLab([
          labData.uri,
          labData.price,
          labData.auth,
          labData.accessURI,
          labData.accessKey
        ]);
      }

      if (txHash) {
        const newLabRecord = { ...labData, id: maxId + 1, providerAddress: address };
        setLastTxHash(txHash);
        setTxType('add');
        setPendingData(newLabRecord);

        // 3. Save the JSON with the lab data if necessary
        if (labData.uri.startsWith('Lab-')) {
          const response = await fetch('/api/provider/saveLabData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labData: newLabRecord }),
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        throw new Error('No transaction hash received');
      }
    } catch (error) {
      console.error('Error adding lab:', error);
      setNotification({
        type: 'error',
        message: `❌ Failed to add lab: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => setNotification(null), 5000);
    }
  }

  // Handle delete a lab
  const handleDeleteLab = async (labId) => {
    const labToDelete = labs.find((lab) => lab.id == labId);
    
    try {
      setNotification({
        type: 'pending',
        message: '⏳ Deleting lab onchain...'
      });

      const txHash = await deleteLab([labId]);
      
      if (txHash) {
        setLastTxHash(txHash);
        setTxType('delete');
        setPendingData(labToDelete);

        // Delete associated files
        const labURI = labToDelete.uri;
        const imagesToDelete = labToDelete.images;
        const docsToDelete = labToDelete.docs;

        // Delete images
        if (imagesToDelete && Array.isArray(imagesToDelete)) {
          await Promise.all(imagesToDelete.map(async (imageToDelete) => {
            if (imageToDelete) {
              const filePathToDelete = imageToDelete.startsWith('/') ? imageToDelete.substring(1) : imageToDelete;            
              const formDatatoDelete = new FormData();
              formDatatoDelete.append('filePath', filePathToDelete);
              formDatatoDelete.append('deletingLab', true);
              const res = await fetch('/api/provider/deleteFile', {
                method: 'POST',
                body: formDatatoDelete,
              });
              if (!res.ok) throw new Error('Failed to delete image file: ' + filePathToDelete);
            }
          }));
        }

        // Delete docs
        if (docsToDelete && Array.isArray(docsToDelete)) {
          await Promise.all(docsToDelete.map(async (docToDelete) => {
            if (docToDelete) {
              const filePathToDelete = docToDelete.startsWith('/') ? docToDelete.substring(1) : docToDelete;
              const formDatatoDelete = new FormData();
              formDatatoDelete.append('filePath', filePathToDelete);
              formDatatoDelete.append('deletingLab', true);
              const res = await fetch('/api/provider/deleteFile', {
                method: 'POST',
                body: formDatatoDelete,
              });
              if (!res.ok) throw new Error('Failed to delete doc file: ' + filePathToDelete);
            }
          }));
        }

        const hasExternalUri = !!(labURI && (labURI.startsWith('http://') || labURI.startsWith('https://')));

        // Only delete JSON if labURI is local
        if (!hasExternalUri) {
          const response = await fetch('/api/provider/deleteLabData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labURI }),
          });
          if (!response.ok) throw new Error('Failed to delete the associated data file on the server.');
        }
      } else {
        throw new Error('No transaction hash received');
      }
    } catch (error) {
      console.error('Error deleting lab:', error);
      setNotification({
        type: 'error',
        message: `❌ Failed to delete lab: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // Handle listing a lab
  const handleList = async (labId) => {
    try {
      setNotification({
        type: 'pending',
        message: '⏳ Listing lab onchain...'
      });

      const txHash = await listLab([labId]);
      
      if (txHash) {
        const updatedLab = { ...labs.find(lab => lab.id === labId), listed: true };
        setLastTxHash(txHash);
        setTxType('list');
        setPendingData(updatedLab);
      } else {
        throw new Error('No transaction hash received');
      }
    } catch (error) {
      console.error('Error listing lab:', error);
      setNotification({
        type: 'error',
        message: `❌ Failed to list lab: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };
  
  // Handle unlisting a lab
  const handleUnlist = async (labId) => {
    try {
      setNotification({
        type: 'pending',
        message: '⏳ Unlisting lab onchain...'
      });

      const txHash = await unlistLab([labId]);
      
      if (txHash) {
        const updatedLab = { ...labs.find(lab => lab.id === labId), listed: false };
        setLastTxHash(txHash);
        setTxType('unlist');
        setPendingData(updatedLab);
      } else {
        throw new Error('No transaction hash received');
      }
    } catch (error) {
      console.error('Error unlisting lab:', error);
      setNotification({
        type: 'error',
        message: `❌ Failed to unlist lab: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => setNotification(null), 5000);
    }
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
    setSelectedLabId(e.target.value);
  };

  return (
    <AccessControl requireWallet message="Please log in to manage your labs.">
      <div className="container mx-auto p-4">
        {/* Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${
            notification.type === 'success' ? 'bg-green-600' :
            notification.type === 'pending' ? 'bg-blue-600' :
            notification.type === 'warning' ? 'bg-yellow-600' :
            'bg-red-600'
          }`}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-white font-medium">{notification.message}</p>
                {notification.hash && (
                  <p className="text-gray-200 text-sm mt-1 break-all">
                    Hash: {notification.hash.slice(0, 10)}...{notification.hash.slice(-8)}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="ml-2 text-white hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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
                  value={selectedLabId}
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
              {selectedLab && (
                <ProviderLabItem
                  lab={selectedLab}
                  onEdit={() => setIsModalOpen(true)}
                  onCollect={handleCollect}
                  onDelete={handleDeleteLab}
                  onList={handleList}
                  onUnlist={handleUnlist}
                />
              )}
              </>
            ) : (
              <p className="text-gray-300 text-center">
                You have no labs registered yet. Press &quot;Add New Lab&quot; to get started.
              </p>
            )}
            <div className="flex justify-center mt-4">
            <button onClick={() => { setNewLab(newLabStructure); setIsModalOpen(true); setSelectedLabId(""); }}
              className="px-6 py-3 rounded shadow-lg bg-[#7b976e] text-white hover:bg-[#83a875]">
              Add New Lab
            </button>
            </div>
          </div>

          <div className="w-full md:w-1/3 mt-8 md:mt-0">
            <h2 className="text-xl font-semibold mb-4 text-center">Upcoming Lab Reservations</h2>
            <div className="flex justify-center">
                <DatePicker
                  calendarClassName="custom-datepicker"
                  selected={date}
                  inline
                  minDate={today}
                  onChange={(newDate) => setDate(newDate)}
                  filterDate={() => false}
                  dayClassName={day =>
                    bookedDates.some(
                      (bookingDetail) => bookingDetail.date.toDateString() === day.toDateString()
                    )
                      ? "bg-[#9fc6f5] text-white"
                      : undefined
                  }
                  renderDayContents={dayContents}
                />
            </div>
          </div>
          
        </div>

        <LabModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSaveLab}
          lab={selectedLab || newLab} maxId={maxId} />

        <FeedbackModal isOpen={showFeedback} title={feedbackTitle} message={feedbackMessage} 
          onClose={() => setShowFeedback(false)} />
      </div>
    </AccessControl>
  );
}