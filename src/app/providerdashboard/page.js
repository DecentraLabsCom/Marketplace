"use client";
import { useEffect, useState } from 'react';
import { parseUnits, formatUnits } from 'viem';
import { useUser } from '@/context/UserContext';
import { useLabs } from '@/context/LabContext';
import { useNotifications } from '@/context/NotificationContext';
import { useLabToken } from '@/hooks/useLabToken';
import { useLabEventCoordinator } from '@/hooks/useLabEventCoordinator';
import { useLabBookings } from '@/hooks/useLabBookings';
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction';
import { useReservationEventCoordinator } from '@/hooks/useReservationEventCoordinator';
import { useWaitForTransactionReceipt } from 'wagmi';
import LabModal from '@/components/LabModal';
import devLog from '@/utils/logger';
import AccessControl from '@/components/AccessControl';
import ProviderLabItem from '@/components/ProviderLabItem';
import CalendarWithBookings from '@/components/CalendarWithBookings';

export default function ProviderDashboard() {
  const { address, user, isSSO } = useUser();
  const { labs, setLabs, loading } = useLabs();
  const { addTemporaryNotification, addPersistentNotification } = useNotifications();
  const { coordinatedLabUpdate } = useLabEventCoordinator();
  const { invalidateLabBookings, invalidateUserBookingsByLab } = useReservationEventCoordinator();
  const { decimals } = useLabToken();
  
  // State declarations
  const [ownedLabs, setOwnedLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { labBookings } = useLabBookings(selectedLabId);

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

  // Wait for transaction receipt
  const { 
    data: receipt, 
    isSuccess: isReceiptSuccess 
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  });

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
      
      addPersistentNotification('success', `✅ ${txType.charAt(0).toUpperCase() + txType.slice(1)} operation confirmed onchain!`);
      
      // Update local state immediately with the confirmed changes
      switch(txType) {
        case 'add':
          setLabs([...labs, pendingData]);
          setIsModalOpen(false); // Only close for new labs
          break;
        case 'update':
          // Update local state immediately - DON'T close modal
          setLabs(labs.map(lab => lab.id === pendingData.id ? pendingData : lab));
          devLog.log('ProviderDashboard: Lab updated in local state, modal remains open');
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
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, labs, setLabs, addPersistentNotification]);

  const selectedLab = ownedLabs.find(lab => String(lab.id) === String(selectedLabId));
  
  const bookingInfo = (selectedLab && labBookings) 
    ? labBookings.map(booking => ({
        ...booking,
        labName: selectedLab.name,
        status: booking.status
      }))
    : [];

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // Filter labs owned by the user
  useEffect(() => {
    if (address && labs) {
      const userLabs = labs.filter((lab) => lab.providerAddress === String(address));
      setOwnedLabs(userLabs);
    }
  }, [address, labs]);

  // Automatically set the first lab as the selected lab
  const hasOwnedLabs = ownedLabs.length > 0;
  useEffect(() => {
    if (hasOwnedLabs && !selectedLabId && !isModalOpen) {
      setSelectedLabId(ownedLabs[0].id);
    }
  }, [hasOwnedLabs, selectedLabId, isModalOpen, ownedLabs]);

  // Handle saving a lab (either when editing an existing one or adding a new one)
  const handleSaveLab = async (labData) => {
    // Store the original human-readable price for local state updates
    const originalPrice = labData.price;
    
    // Convert price from user input to token units for blockchain operations
    if (labData.price && decimals) {
      try {
        // Convert hourly price (UI) to per-second price (contract format)
        const pricePerHour = parseFloat(labData.price.toString());
        const pricePerSecond = pricePerHour / 3600; // Convert to per-second
        
        // Convert the per-second price to token units (multiply by decimals)
        const priceInTokenUnits = parseUnits(pricePerSecond.toString(), decimals);
        labData = { ...labData, price: priceInTokenUnits.toString() };
      } catch (error) {
        devLog.error('Error converting price to token units:', error);
        addTemporaryNotification('error', '❌ Invalid price format. Please enter a valid number.');
        return;
      }
    }
    
    if (labData.id) {
      await handleEditLab({ labData, originalPrice });
    } else {
      await handleAddLab({ labData });
    }
  };

  // Handle editing/updating a lab
  async function handleEditLab({ labData, originalPrice }) {
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

    // Use coordinated update to prevent collisions with blockchain events
    await coordinatedLabUpdate(async () => {

    try {
      // 1. Update lab data
      if (hasChangedOnChainData) {
        // 1a. If there is any change in the on-chain data, update blockchain
        addTemporaryNotification('pending', '⏳ Updating lab onchain...');

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
          // Store pending data with per-second price
          const pricePerHour = parseFloat(originalPrice);
          const pricePerSecond = pricePerHour / 3600;
          setPendingData({ ...labData, price: pricePerSecond });
        } else {
          throw new Error('No transaction hash received');
        }
      } else {
        // 1b. If there is no change in the on-chain data, just update the local state
        // Keep price in human-readable format for consistency
        setLabs(labs.map((lab) => lab.id == labData.id ? { ...labData, price: originalPrice } : lab));
        // DON'T close modal - let user close it manually
        addTemporaryNotification('success', '✅ Lab updated successfully (offchain changes only)!');
        devLog.log('ProviderDashboard: Lab updated locally (offchain), modal remains open');
      }

      // 2. Save the JSON if necessary
      if (labData.uri.startsWith('Lab-')) {
        try {
          const response = await fetch('/api/provider/saveLabData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Save with human-readable price for JSON consistency
            body: JSON.stringify({ labData: { ...labData, price: originalPrice } }),
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
          addTemporaryNotification('error', `❌ Failed to save lab data: ${formatErrorMessage(error)}`);
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
      devLog.error('Error updating lab:', error);
      addTemporaryNotification('error', `❌ Failed to update lab: ${formatErrorMessage(error)}`);
      throw error; // Re-throw for coordinatedLabUpdate to handle
    }
    }, labData.id); // End of coordinatedLabUpdate - pass labId for targeted cache invalidation
  }

  // Handle adding a new lab
  async function handleAddLab({ labData }) {
    const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;
    labData.uri = labData.uri || `Lab-${user.name}-${maxId + 1}.json`;

    // Use coordinated update to prevent collisions with blockchain events
    await coordinatedLabUpdate(async () => {
      try {
        addTemporaryNotification('pending', '⏳ Adding lab onchain...');

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
          // Convert price from token units back to per-second decimal for cache consistency
          const priceInTokenUnits = BigInt(labData.price);
          const pricePerSecond = parseFloat(formatUnits(priceInTokenUnits, decimals));
          const newLabRecord = { ...labData, id: maxId + 1, providerAddress: address, price: pricePerSecond };
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
        devLog.error('Error adding lab:', error);
        addTemporaryNotification('error', `❌ Failed to add lab: ${formatErrorMessage(error)}`);
        throw error; // Re-throw for coordinatedLabUpdate to handle
      }
    }); // End of coordinatedLabUpdate - null because new lab ID isn't known yet
  }

  // Handle delete a lab
  const handleDeleteLab = async (labId) => {
    const labToDelete = labs.find((lab) => lab.id == labId);
    
    // Use coordinated update to prevent collisions with blockchain events
    await coordinatedLabUpdate(async () => {
      try {
        addTemporaryNotification('pending', '⏳ Deleting lab onchain...');

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

        // CRITICAL: Clean up all bookings for this deleted lab
        devLog.log('🗑️ Cleaning up all bookings for deleted lab:', labId);
        
        // Invalidate lab bookings (for provider view)
        invalidateLabBookings(labId);
        
        // Invalidate user bookings that reference this lab (for all users)
        await invalidateUserBookingsByLab(labId);
        
        devLog.log('✅ Successfully cleaned up all bookings for deleted lab:', labId);
        
        // Notify about booking cancellations
        addTemporaryNotification('warning', 
          `⚠️ Lab deleted successfully. All associated reservations have been automatically cancelled.`
        );
      } else {
        throw new Error('No transaction hash received');
      }
    } catch (error) {
      devLog.error('Error deleting lab:', error);
      addTemporaryNotification('error', `❌ Failed to delete lab: ${formatErrorMessage(error)}`);
      throw error; // Re-throw for coordinatedLabUpdate to handle
    }
    }, labId); // End of coordinatedLabUpdate - pass labId for targeted cache invalidation
  };

  // Handle listing a lab
  const handleList = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Listing lab onchain...');

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
      devLog.error('Error listing lab:', error);
      addTemporaryNotification('error', `❌ Failed to list lab: ${formatErrorMessage(error)}`);
    }
  };
  
  // Handle unlisting a lab
  const handleUnlist = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Unlisting lab onchain...');

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
      devLog.error('Error unlisting lab:', error);
      addTemporaryNotification('error', `❌ Failed to unlist lab: ${formatErrorMessage(error)}`);
    }
  };

  // Handle collecting balances from all labs
  const handleCollectAll = async () => {
    try {
      addTemporaryNotification('pending', '⏳ Collecting all balances...');
      
      const res = await fetch('/api/contract/reservation/claimAllBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error('Failed to collect balance');
      
      addTemporaryNotification('success', '✅ All balances collected successfully!');
    } catch (err) {
      devLog.error(err);
      addTemporaryNotification('error', `❌ Failed to collect balances: ${formatErrorMessage(err)}`);
    }
  };
  
  // Handle collecting balance from a specific lab
  const handleCollect = async (labId) => {
    try {
      addTemporaryNotification('pending', '⏳ Collecting lab balance...');
      
      const res = await fetch('/api/contract/reservation/claimLabBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, labId }),
      });
      if (!res.ok) throw new Error('Failed to collect balance');
      
      addTemporaryNotification('success', '✅ Balance collected successfully!');
    } catch (err) {
      devLog.error(err);
      addTemporaryNotification('error', `❌ Failed to collect balance: ${formatErrorMessage(err)}`);
    }
  };

  const handleSelectChange = (e) => {
    setSelectedLabId(e.target.value);
  };

  // Helper function to clean and shorten error messages
  const formatErrorMessage = (error) => {
    let message = error.message || 'Unknown error';
    
    // Common patterns to simplify
    const patterns = [
      { regex: /execution reverted:?\s*/i, replacement: '' },
      { regex: /VM Exception while processing transaction:?\s*/i, replacement: '' },
      { regex: /Error:\s*/i, replacement: '' },
      { regex: /Failed to.*?:\s*/i, replacement: '' },
      { regex: /HTTP error! status: (\d+)/, replacement: 'Server error ($1)' },
      { regex: /network.*?error/i, replacement: 'Network error' },
      { regex: /insufficient.*?funds/i, replacement: 'Insufficient funds' },
      { regex: /user.*?rejected/i, replacement: 'Transaction rejected' },
      { regex: /wallet.*?connection/i, replacement: 'Wallet error' }
    ];
    
    // Apply patterns
    patterns.forEach(({ regex, replacement }) => {
      message = message.replace(regex, replacement);
    });
    
    // Truncate if still too long
    if (message.length > 80) {
      message = message.substring(0, 77) + '...';
    }
    
    return message.trim() || 'Operation failed';
  };

  return (
    <AccessControl requireWallet message="Please log in to manage your labs.">
      <div className="container mx-auto p-4">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">Lab Panel</h1>
        </div>

        <div className="flex flex-col min-[1080px]:flex-row">

          <div className="w-full min-[1080px]:w-2/3">
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

          <div className="w-full min-[1080px]:w-1/3 mt-8 min-[1080px]:mt-0">
            <h2 className="text-xl font-semibold mb-4 text-center">Upcoming Lab Reservations</h2>
            <div className="flex justify-center">
                <CalendarWithBookings
                  selectedDate={date}
                  onDateChange={(newDate) => setDate(newDate)}
                  bookingInfo={bookingInfo}
                  minDate={today}
                  filterDate={() => false}
                  displayMode="provider-dashboard"
                />
            </div>
          </div>
          
        </div>

        <LabModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSaveLab}
          lab={selectedLab || newLab} maxId={maxId} />
      </div>
    </AccessControl>
  );
}
