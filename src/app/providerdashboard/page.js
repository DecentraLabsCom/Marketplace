"use client";
import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { useUser } from '../../context/UserContext';
import { useLabs } from '../../context/LabContext';
import useContractWriteFunction from '../../hooks/contract/useContractWriteFunction';
import useLabFeedback from '../../hooks/useLabFeedback';
import LabModal from '../../components/LabModal';
import AccessControl from '../../components/AccessControl';
import FeedbackModal from '../../components/FeedbackModal';
import ProviderLabItem from '../../components/ProviderLabItem';

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

  // Control feedback on success and on error & control action (set labs) on success
  const { setPendingEditingLabs, setPendingDeleteLabs, setPendingNewLab,
    setPendingListLabs, setPendingUnlistLabs,
  } = useLabFeedback({ labs, setLabs,
    setIsModalOpen, setShowFeedback, setFeedbackTitle, setFeedbackMessage,
    isAddSuccess, isUpdateSuccess, isDeleteSuccess, isListSuccess, isUnlistSuccess,
    addError, updateError, deleteError, listError, unlistError,
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
          lab.bookingInfo
            .forEach(booking => {
              try {
                const bookingDateObject = new Date(booking.date);

                if (!isNaN(bookingDateObject.getTime()) && bookingDateObject.getTime() >= today.getTime()) {
                  allBookingsDetails.push({
                    labId: lab.id,
                    labName: lab.name,
                    date: bookingDateObject,
                    time: booking.time,
                    minutes: booking.minutes,
                    dateString: booking.date
                  });
                }
              } catch (error) {
                console.error("Error converting date in lab:", lab.name, booking.date, error);
              }
            });
        } else {
          console.warn(`  Lab ${lab.name} has bookingInfo but it is not an array or is missing:`, lab.bookingInfo);
        }
      });
      setBookedDates(allBookingsDetails);
    }
  }, [ownedLabs, today.toDateString()]);

  const renderDayContents = (day, currentDateRender) => {
    const bookingsForCurrentDay = bookedDates.filter(
      (bookingDetail) => bookingDetail.date.toDateString() === currentDateRender.toDateString()
    );

    let title = undefined;

    if (bookingsForCurrentDay.length > 0) {
      title = bookingsForCurrentDay.map(bookingDetail => {
        if (bookingDetail.time && bookingDetail.minutes !== undefined && bookingDetail.minutes !== null) {
          const startDateTimeString = `${bookingDetail.dateString}T${bookingDetail.time}`;
          const startDate = new Date(startDateTimeString);

          if (isNaN(startDate.getTime())) {
            console.error(`Error: Invalid start date for booking detail in tooltip: ${startDateTimeString}. Skipping this booking in tooltip.`);
            return `Invalid Booking: ${bookingDetail.labName}`;
          }

          const endTimeDate = new Date(startDate.getTime() + parseInt(bookingDetail.minutes) * 60 * 1000);
          const endTime = `${String(endTimeDate.getHours()).padStart(2, '0')}:${String(endTimeDate.getMinutes()).padStart(2, '0')}`;

          return `${bookingDetail.labName}: ${bookingDetail.time} - ${endTime}`;
        } else {
          return `Booking incomplete: ${bookingDetail.labName}`;
        }
      }).join(', ');
    }

    return <div title={title}>{day}</div>;
  };


  // Automatically set the first lab as the selected lab
  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen) {
      setSelectedLabId(ownedLabs[0].id);
    }
  }, [ownedLabs, selectedLabId, isModalOpen]);

  // Handle saving a lab (either when editing an existing one or adding a new one)
  const handleSaveLab = async (labData) => {
    if (labData.id) {
      await handleEditLab({
        labData, labs, user, updateLab, setPendingEditingLabs,
        setFeedbackTitle, setFeedbackMessage, setShowFeedback, setIsModalOpen
      });
    } else {
      await handleAddLab({
        labData, labs, user, address, addLab, setPendingNewLab,
        setFeedbackTitle, setFeedbackMessage, setShowFeedback
      });
    }
  };

  // Handle editing/updating a lab
  async function handleEditLab({
    labData, labs, user, updateLab, setPendingEditingLabs,
    setFeedbackTitle, setFeedbackMessage, setShowFeedback, setIsModalOpen
  }) {
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
      const updatedLabs = labs.map((lab) =>
        lab.id == labData.id ? { ...labData } : lab
      );
      // 1. Update lab data
      if (hasChangedOnChainData) {
        // 1a. If there is any change in the on-chain data, update blockchain and local state
        const tx = await updateLab([
          labData.id,
          labData.uri,
          labData.price,
          labData.auth,
          labData.accessURI,
          labData.accessKey
        ]);
        if (tx?.wait) await tx.wait();
        setPendingEditingLabs(updatedLabs);
      } else {
        // 1b. If there is no change in the on-chain data, just update the local state
        setLabs(updatedLabs);
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
          setFeedbackTitle('Error!');
          setFeedbackMessage('Failed to save lab data.');
          setShowFeedback(true);
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

      if (!hasChangedOnChainData) {
        setFeedbackTitle('Success!');
        setFeedbackMessage('Lab updated successfully.');
        setShowFeedback(true);
        setIsModalOpen(false);
      }
    } catch (error) {
      setFeedbackTitle('Error!');
      setFeedbackMessage('Failed to update lab on blockchain or save data.');
      setShowFeedback(true);
    }
  }

  // Handle adding a new lab
  async function handleAddLab({
    labData, labs, user, address, addLab, setPendingNewLab,
    setFeedbackTitle, setFeedbackMessage, setShowFeedback
  }) {
    const maxId = labs.length > 0 ? Math.max(...labs.map(lab => lab.id || 0)) : 0;
    labData.uri = labData.uri || `Lab-${user.name}-${maxId + 1}.json`;

    try {
      // 1. Launch the transaction to add the lab on-chain
      const tx = await addLab([
        labData.uri,
        labData.price,
        labData.auth,
        labData.accessURI,
        labData.accessKey
      ]);
      if (tx?.wait) await tx.wait();

      // 2. Update the local state
      const newLabRecord = { ...labData, id: maxId + 1, providerAddress: address };
      setPendingNewLab(newLabRecord);

      // 3. Save the JSON with the lab data if necessary
      if (labData.uri.startsWith('Lab-')) {
        const response = await fetch('/api/provider/saveLabData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labData: newLabRecord }),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      setFeedbackTitle('Error!');
      setFeedbackMessage('Failed to add lab on blockchain or save data.');
      setShowFeedback(true);
    }
  }

  // Handle delete a lab
  const handleDeleteLab = async (labId) => {
    console.log('Deleting lab with ID:', labId);
    const tx = await deleteLab([labId]);
    if (tx?.wait) await tx.wait();

    const labToDelete = labs.find((lab) => lab.id == labId);
    const labURI = labToDelete.uri;
    const imagesToDelete = labToDelete.images;
    const docsToDelete = labToDelete.docs;

    try {
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

      // If all went well, update state and feedback
      const updatedLabs = labs.filter((lab) => lab.id !== labId);
      setPendingDeleteLabs(updatedLabs);
    } catch (error) {
      setShowFeedback(true);
      setFeedbackTitle("Error Deleting Lab");
      setFeedbackMessage(error.message || "An error occurred while deleting lab data.");
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
    setSelectedLabId(e.target.value);
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
                <DatePicker calendarClassName="custom-datepicker" selected={date} inline minDate={today}
                  onChange={(newDate) => setDate(newDate)}
                  filterDate={() => false}
                  dayClassName={(day) =>
                    bookedDates.some(
                      (bookingDetail) => bookingDetail.date.toDateString() === day.toDateString()
                    )
                    ? "bg-[#9fc6f5] text-white"
                    : undefined
                  }
                  renderDayContents={renderDayContents}
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