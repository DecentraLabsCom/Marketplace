import { useState, useEffect } from 'react';

export default function useLabFeedback({
  labs, setLabs, 
  setEditingLab, setIsModalOpen, setShowFeedback, setFeedbackTitle, setFeedbackMessage,
  isAddSuccess, isUpdateSuccess, isDeleteSuccess, isListSuccess, isUnlistSuccess,
  addError, updateError, deleteError, listError, unlistError,
}) {
  const [pending, setPending] = useState({ editing: null, delete: null,
    new: null, list: null, unlist: null,
  });

  // Feedback and action (set labs state variable) on success
  useEffect(() => {
    setFeedbackTitle('Success!');
    if (isUpdateSuccess && pending.editing) {
      setLabs(pending.editing);
      setFeedbackMessage('Lab updated successfully.');
      setShowFeedback(true);
      setEditingLab(null);
      setIsModalOpen(false);
      setPending(p => ({ ...p, editing: null }));
    }
    if (isAddSuccess && pending.new) {
      setLabs([...labs, pending.new]);
      setFeedbackMessage('Lab added successfully.');
      setShowFeedback(true);
      setEditingLab(null);
      setIsModalOpen(false);
      setPending(p => ({ ...p, new: null }));
    }
    if (isDeleteSuccess && pending.delete) {
      setLabs(pending.delete);
      setFeedbackMessage('Lab deleted successfully.');
      setShowFeedback(true);
      setPending(p => ({ ...p, delete: null }));
    }
    if (isListSuccess && pending.list) {
      setLabs(pending.list);
      setFeedbackMessage('Lab listed successfully.');
      setShowFeedback(true);
      setPending(p => ({ ...p, list: null }));
    }
    if (isUnlistSuccess && pending.unlist) {
      setLabs(pending.unlist);
      setFeedbackMessage('Lab unlisted successfully.');
      setShowFeedback(true);
      setPending(p => ({ ...p, unlist: null }));
    }
  }, [
    isUpdateSuccess, isAddSuccess, isDeleteSuccess, isListSuccess, isUnlistSuccess, pending,
    labs, setLabs, setFeedbackTitle, setFeedbackMessage, setShowFeedback, setEditingLab, setIsModalOpen
  ]);

  // Feedback on error
  useEffect(() => {
    const errorMap = [
      { error: addError, msg: "Error adding lab: " },
      { error: updateError, msg: "Error updating lab: " },
      { error: deleteError, msg: "Error deleting lab: " },
      { error: listError, msg: "Error listing lab: " },
      { error: unlistError, msg: "Error unlisting lab: " },
    ];
    for (const { error, msg } of errorMap) {
      if (error) {
         if (error.message.includes("contract address") ||
         error.message.includes("is invalid") ||
         error.message.includes("no contract deployed") ||
         error.message.includes("does not exist on this network")
        ) {
          console.log("Error:", error);
          setFeedbackMessage("Wrong network. Please switch your wallet to the correct network.");
        } else {
          setFeedbackMessage(msg + error.message);
        }
        setFeedbackTitle('Error!');
        setShowFeedback(true);
        break;
      }
    }
  }, [addError, updateError, deleteError, listError, unlistError, setFeedbackTitle, setFeedbackMessage, 
    setShowFeedback]);

  return {
    setPendingEditingLabs: (labs) => setPending(p => ({ ...p, editing: labs })),
    setPendingDeleteLabs: (labs) => setPending(p => ({ ...p, delete: labs })),
    setPendingNewLab: (lab) => setPending(p => ({ ...p, new: lab })),
    setPendingListLabs: (labs) => setPending(p => ({ ...p, list: labs })),
    setPendingUnlistLabs: (labs) => setPending(p => ({ ...p, unlist: labs })),
  };
}