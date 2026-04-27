"use client";
import React, { useEffect, useReducer, useRef, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Cpu, Monitor } from 'lucide-react'
import { useLabCredit } from '@/context/LabCreditContext'
import { useNotifications } from '@/context/NotificationContext'
import { useUploadFile, useDeleteFile } from '@/hooks/provider/useProvider'
import LabFormFullSetup from '@/components/dashboard/provider/LabFormFullSetup'
import LabFormQuickSetup from '@/components/dashboard/provider/LabFormQuickSetup'
import { validateLabFull, validateLabQuick, validateFmuFields } from '@/utils/labValidation'
import { normalizeLabDates } from '@/utils/dates/dateFormatter'
import { RESOURCE_TYPES, getResourceType } from '@/utils/resourceType'
import { initialState, extractInternalLabUri, reducer } from './labModalReducer'
import { verifyFmuReference } from './labModalFmuUtils'
import devLog from '@/utils/dev/logger'

/** Must match the server-side limit in /api/provider/uploadFile/route.js */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Modal for creating and editing lab information with full and quick setup modes
 * Handles complex form state, file uploads, and validation
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Function} props.onSubmit - Callback to submit lab data
 * @param {Object} props.lab - Lab object for editing (null for creating new lab)
 * @param {number} props.maxId - Maximum lab ID for generating new lab IDs
 * @returns {JSX.Element} Lab creation/editing modal component
 */
export default function LabModal({ isOpen, onClose, onSubmit, lab = null, maxId = 0, onFilesUploaded = null }) {
  const { decimals, formatPrice } = useLabCredit();
  const uploadFileMutation = useUploadFile();
  const { addWarningNotification, addErrorNotification } = useNotifications();
  const deleteFileMutation = useDeleteFile();
  const [state, dispatch] = useReducer(reducer, lab, initialState);
  const {
    activeTab,
    imageInputType,
    docInputType,
    localImages,
    localDocs,
    imageUrls,
    docUrls,
    localLab,
    isExternalURI,
    errors,
    isLocalURI,
    clickedToEditUri,
  } = state;

  const nameRef = useRef(null);
  const categoryRef = useRef(null);
  const keywordsRef = useRef(null);
  const descriptionRef = useRef(null);
  const priceRef = useRef(null);
  const authRef = useRef(null);
  const accessURIRef = useRef(null);
  const accessKeyRef = useRef(null);
  const timezoneRef = useRef(null);
  const timeSlotsRef = useRef(null);
  const availableHoursStartRef = useRef(null);
  const availableHoursEndRef = useRef(null);
  const maxConcurrentUsersRef = useRef(null);
  const termsUrlRef = useRef(null);
  const termsShaRef = useRef(null);
  const uriRef = useRef(null);
  const imageLinkRef = useRef(null);
  const docLinkRef = useRef(null);
  const uploadedTempFiles = useRef([]);
  const imageUploadRef = useRef(null);
  const docUploadRef = useRef(null);
  const lastInitializedLabId = useRef(null);

  // For EDITING: use the blockchain labId
  // For CREATING: use 'temp' folder until we get the real labId after mint
  const currentLabId = lab?.id || 'temp';
  const jsonFileRegex = useMemo(() => new RegExp(/^[\w\-._/]+\.json$/i), []);

  const uploadFile = async (file, destinationFolder, labId) => {
    const result = await uploadFileMutation.mutateAsync({
      file,
      destinationFolder,
      labId
    });

    let filePath = result.filePath;

    // Keep track of uploaded temporal files
    uploadedTempFiles.current.push(filePath);
    return filePath;
  };

  const handleClose = useCallback(() => {
    dispatch({ type: 'RESET', lab: {} }); // Use empty object to avoid lab dependency
    onClose();
  }, [onClose]); // Keep minimal dependencies

  const deleteFile = useCallback(async (filePath) => {
    await deleteFileMutation.mutateAsync({
      filePath,
      deletingLab: false
    });
    devLog.log(`Temporal file ${filePath} deleted successfully.`);
  }, [deleteFileMutation]);

  useEffect(() => {
    if (!isOpen) {
      // Delete uploaded temporal files
      Promise.allSettled(uploadedTempFiles.current.map(filePath => deleteFile(filePath)))
        .then(results => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              devLog.error(`Failed deleting ${uploadedTempFiles.current[index]}:`, result.reason);
            }
          });
          uploadedTempFiles.current = [];
        });

      // Batch all cleanup updates in a single dispatch
      const cleanupUpdates = [
        { type: 'SET_FIELD', field: 'localImages', value: [] },
        { type: 'SET_FIELD', field: 'localDocs', value: [] },
        { type: 'SET_FIELD', field: 'imageUrls', value: [] },
        { type: 'SET_FIELD', field: 'docUrls', value: [] },
        { type: 'SET_FIELD', field: 'isExternalURI', value: false },
        { type: 'SET_FIELD', field: 'isLocalURI', value: false },
        { type: 'SET_FIELD', field: 'clickedToEditUri', value: false },
        { type: 'SET_FIELD', field: 'errors', value: {} }
      ];
      dispatch({ type: 'BATCH_UPDATE', updates: cleanupUpdates });
      return;
    }

    uploadedTempFiles.current = [];

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'RESET', lab: {} });
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]); // Use onClose directly instead of handleClose

  // Load existing images and docs for preview when the modal opens
  useEffect(() => {
    // Only run when modal is open and lab changes
    if (!isOpen) {
      lastInitializedLabId.current = null;
      return;
    }
    
    // Only run if we have a valid lab object
    if (!lab || typeof lab !== 'object') {
      devLog.warn('LabModal: Invalid lab object received:', lab);
      return;
    }

    // Skip if we already initialized this lab
    if (lastInitializedLabId.current === lab?.id) {
      return;
    }

    devLog.log('LabModal: Initializing with lab:', { labId: lab?.id, labName: lab?.name });
    lastInitializedLabId.current = lab?.id;

    // Batch all state updates to prevent multiple re-renders
    const updates = [];
    
    // Create a stable lab object to merge with local state
    let labToMerge = { ...lab };
    labToMerge.resourceType = getResourceType(lab)
    const normalizedUri = extractInternalLabUri(lab?.uri);
    if (normalizedUri) {
      labToMerge.uri = normalizedUri;
    }
    
    // Convert price from per-second (cache format) to per-hour (UI input format)
    if (labToMerge.price && decimals) {
      try {
        // Use formatPrice to convert from per-second to per-hour for input fields
        const pricePerHour = formatPrice(labToMerge.price);
        labToMerge.price = pricePerHour;
      } catch (error) {
        devLog.error('Error converting price for UI input:', error);
        // Keep original price if conversion fails
      }
    }
    
    updates.push({ type: 'MERGE_LOCAL_LAB', value: labToMerge });
    
    // Handle URI flags
    const uiUri = labToMerge?.uri || '';
    const hasExternalUri = !!(uiUri && (uiUri.startsWith('http://') || uiUri.startsWith('https://')));
    updates.push({ type: 'SET_FIELD', field: 'isExternalURI', value: hasExternalUri });
    
    const hasLocalUri = !!(uiUri && !hasExternalUri && jsonFileRegex.test(uiUri));
    updates.push({ type: 'SET_FIELD', field: 'isLocalURI', value: hasLocalUri });
    
    updates.push({ type: 'SET_FIELD', field: 'clickedToEditUri', value: false });

    // Handle images
    if (lab?.images?.length > 0) {
      const initialImageUrls = lab.images.map(imageUrl => {
        if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
          return imageUrl;
        }
        return imageUrl;
      });
      updates.push({ type: 'SET_FIELD', field: 'imageUrls', value: initialImageUrls });
      updates.push({ type: 'SET_FIELD', field: 'imageInputType', value: 'upload' });
    } else {
      updates.push({ type: 'SET_FIELD', field: 'imageInputType', value: 'link' });
      updates.push({ type: 'SET_FIELD', field: 'imageUrls', value: [] });
    }

    // Handle docs
    if (lab?.docs?.length > 0) {
      updates.push({ type: 'SET_FIELD', field: 'docUrls', value: lab.docs });
      updates.push({ type: 'SET_FIELD', field: 'docInputType', value: 'upload' });
    } else {
      updates.push({ type: 'SET_FIELD', field: 'docInputType', value: 'link' });
      updates.push({ type: 'SET_FIELD', field: 'docUrls', value: [] });
    }

    // Execute all updates in a single batch to prevent multiple re-renders
    dispatch({ type: 'BATCH_UPDATE', updates });
  }, [isOpen, lab?.id, decimals, formatPrice, jsonFileRegex]); // Include all dependencies

  const handleImageChange = useCallback((e) => {
    if (!e.target.files) return;

    if (!currentLabId) {
      devLog.error("No valid lab ID available for image upload. Lab:", lab, "Missing ID:", currentLabId);
      return;
    }

    const files = Array.from(e.target.files);

    // Filter out non-image files
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      addWarningNotification('Only valid image files are allowed (JPEG, PNG, GIF, etc.).');
    }
    if (imageFiles.length === 0) return;

    // Client-side file size validation
    const validImages = imageFiles.filter(file => file.size <= MAX_FILE_SIZE_BYTES);
    const oversizeImages = imageFiles.filter(file => file.size > MAX_FILE_SIZE_BYTES);
    oversizeImages.forEach(file => {
      addWarningNotification(
        `"${file.name}" exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB and will not be uploaded.`
      );
    });
    if (validImages.length === 0) return;

    // Show previews immediately
    dispatch({ type: 'SET_FIELD', field: 'localImages', value: [...localImages, ...validImages] });
    const newImageUrls = validImages.map(file => URL.createObjectURL(file));
    dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: [...imageUrls, ...newImageUrls] });

    // Upload asynchronously
    const uploadImages = async () => {
      try {
        const uploadedPaths = await Promise.all(
          validImages.map(file => uploadFile(file, 'images', currentLabId))
        );
        dispatch({
          type: 'MERGE_LOCAL_LAB',
          value: { images: [...(localLab.images || []), ...uploadedPaths] },
        });
      } catch (error) {
        devLog.error("Error uploading images", error);
        addErrorNotification(error, 'image upload');
      }
    };
    uploadImages();
  }, [localLab, localImages, imageUrls, currentLabId, lab, addWarningNotification, addErrorNotification]);

  const handleDocChange = useCallback(async (e) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const pdfFiles = files.filter(file => file.type === 'application/pdf');

      if (pdfFiles.length !== files.length) {
        addWarningNotification('Only PDF files are allowed for documents.');
      }
      if (pdfFiles.length === 0) return;

      // Client-side file size validation before upload
      const validFiles = pdfFiles.filter(file => file.size <= MAX_FILE_SIZE_BYTES);
      const oversizeFiles = pdfFiles.filter(file => file.size > MAX_FILE_SIZE_BYTES);
      oversizeFiles.forEach(file => {
        addWarningNotification(
          `"${file.name}" exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB and will not be uploaded.`
        );
      });
      if (validFiles.length === 0) return;

      // Show file names immediately in the pending list for visual feedback during upload
      dispatch({ type: 'SET_FIELD', field: 'localDocs', value: [...localDocs, ...validFiles] });

      try {
        const newDocUrls = await Promise.all(
          validFiles.map(async (file) => {
            const filePath = await uploadFile(file, 'docs', currentLabId);
            return filePath;
          })
        );

        // Move uploaded files from pending list to the permanent URL list
        dispatch({ type: 'SET_FIELD', field: 'localDocs', value: localDocs.filter(f => !validFiles.includes(f)) });
        dispatch({ type: 'SET_FIELD', field: 'docUrls', value: [...docUrls, ...newDocUrls] });
        dispatch({
          type: 'MERGE_LOCAL_LAB',
          value: { docs: [...(localLab.docs || []), ...newDocUrls] },
        });
      } catch (error) {
        // Remove failed files from the pending list so the user can retry
        dispatch({ type: 'SET_FIELD', field: 'localDocs', value: localDocs.filter(f => !validFiles.includes(f)) });
        devLog.error("Error uploading docs", error);
        addErrorNotification(error, 'document upload');
      }
    }
  }, [localLab, localDocs, docUrls, currentLabId, addWarningNotification, addErrorNotification]);

  const removeImage = (index) => {
    const newImages = localImages.filter((_, i) => i !== index);
    dispatch({ type: 'SET_FIELD', field: 'localImages', value: newImages });

    const newUrls = imageUrls.filter((_, i) => i !== index);
    const urlToRemove = imageUrls[index];
    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove);
    }

    if (localLab.images[index] && !localLab.images[index].startsWith('http')) {
      const filePathToDelete = localLab.images[index].startsWith('/')
        ? localLab.images[index].substring(1)
        : localLab.images[index];
      
      deleteFileMutation.mutate(
        { filePath: filePathToDelete, deletingLab: false },
        {
          onError: (error) => {
            devLog.error('Failed to delete image file:', error.message);
          }
        }
      );
    }

    dispatch({
      type: 'MERGE_LOCAL_LAB',
      value: { images: (localLab.images || []).filter((_, i) => i !== index) },
    });
    dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: newUrls });
  };

  const removeDoc = (index) => {
    const newUrls = docUrls.filter((_, i) => i !== index);
    const urlToRemove = docUrls[index];
    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove);
    }

    if (localLab.docs[index]) {
      const filePathToDelete = localLab.docs[index].startsWith('/')
        ? localLab.docs[index].substring(1)
        : localLab.docs[index];
      
      deleteFileMutation.mutate(
        { filePath: filePathToDelete, deletingLab: false },
        {
          onError: (error) => {
            devLog.error('Failed to delete doc file:', error.message);
          }
        }
      );
    }

    dispatch({
      type: 'MERGE_LOCAL_LAB',
      value: { docs: (localLab.docs || []).filter((_, i) => i !== index) },
    });
    dispatch({ type: 'SET_FIELD', field: 'docUrls', value: newUrls });
  };

  const handleUriChange = (e) => {
    const newUri = e.target.value;
    const originalLabUri = lab?.uri || '';

    const startsWithProtocol = newUri.startsWith('http://') || 
                              newUri.startsWith('https://') || 
                              newUri.startsWith('ftp://');
    const newIsExternal = !!(newUri && startsWithProtocol);
    const newIsLocal = !!(newUri && !newIsExternal && jsonFileRegex.test(newUri));

    let newErrors = { ...errors };
    const updates = [];

    // --- Case 1: Was a local URI, attempting to change its path/name ---
    if ((isLocalURI || (originalLabUri && jsonFileRegex.test(originalLabUri))) && newIsLocal && 
    newUri !== originalLabUri) {
      // Revert the URI to its original value and grey out.
      updates.push({ type: 'MERGE_LOCAL_LAB', value: { uri: originalLabUri } });
      updates.push({ type: 'SET_FIELD', field: 'clickedToEditUri', value: false });
      updates.push({ type: 'SET_FIELD', field: 'isExternalURI', value: false });
      updates.push({ type: 'SET_FIELD', field: 'isLocalURI', value: true });
      if (!newUri.endsWith('.json')) {
        updates.push({ type: 'SET_FIELD', field: 'errors', value: newErrors });
      } else {
        updates.push({ type: 'SET_FIELD', field: 'errors', value: { uri: '' } });
      }
      dispatch({ type: 'BATCH_UPDATE', updates });
      return;
    } else if (!newIsExternal && !newIsLocal && clickedToEditUri && newUri !== '') {
      newErrors.uri = 'It must be an external URL';
      updates.push({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    } else if (newIsExternal && clickedToEditUri && newErrors.uri === 'It must be an external URL') {
      delete newErrors.uri;
      updates.push({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    } else if (newUri == '' && clickedToEditUri) {
      newErrors.uri = 'Lab Data URL is required';
      updates.push({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    }

    // --- Update 'localLab.uri' and states ---
    // If we reached here, the change is either allowed or it's an external link
    updates.push({ type: 'MERGE_LOCAL_LAB', value: { uri: newUri } });
    updates.push({ type: 'SET_FIELD', field: 'isExternalURI', value: newIsExternal });
    updates.push({ type: 'SET_FIELD', field: 'isLocalURI', value: newIsLocal });

    // --- Case 2: Introducing an external link (and clearing Full Setup fields) ---
    if (newIsExternal && !isExternalURI) {
      updates.push({
        type: 'MERGE_LOCAL_LAB',
        value: {
          name: '',
          category: '',
          keywords: [],
          description: '',
          timeSlots: [],
          opens: '',
          closes: '',
          images: [],
          docs: [],
        },
      });

      // Clear image and document previews and associated local states
      updates.push({ type: 'SET_FIELD', field: 'imageUrls', value: [] });
      updates.push({ type: 'SET_FIELD', field: 'docUrls', value: [] });
      updates.push({ type: 'SET_FIELD', field: 'localImages', value: [] });
      updates.push({ type: 'SET_FIELD', field: 'localDocs', value: [] });

      // Delete any temporarily uploaded files from the server
      if (uploadedTempFiles.current.length > 0) {
        Promise.allSettled(uploadedTempFiles.current.map(filePath => deleteFile(filePath)))
          .then(results => {
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                  devLog.error(`Failed deleting temp file ${uploadedTempFiles.current[index]}:`, result.reason);
              }
            });
            uploadedTempFiles.current = [];
        });
      }
      newErrors.uri = 'Introducing a link to a JSON file will replace the data in Full Setup with the ' +
                      'information contained in the linked JSON';
      updates.push({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    }

    // Execute all updates in a single batch
    dispatch({ type: 'BATCH_UPDATE', updates });
  };

  useEffect(() => {
    dispatch({ type: 'SET_FIELD', field: 'errors', value: {} });
  }, [activeTab]);

  const validateForm = () => {
    let newErrors = {};
    if (activeTab === 'full') {
      if (!isExternalURI) {
        newErrors = validateLabFull(localLab, { imageInputType, docInputType });
        // Additional FMU-specific validation
        if (localLab.resourceType === RESOURCE_TYPES.FMU) {
          const fmuErrors = validateFmuFields(localLab);
          newErrors = { ...newErrors, ...fmuErrors };
        }
      }
    } else if (activeTab === 'quick') {
      newErrors = validateLabQuick(localLab);
    }
    dispatch({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    return newErrors;
  };

  // Function to focus the first input with an error
  const focusFirstError = (currentErrors, currentTab) => {
    const fieldsToFocus = {
        full: [
            { name: 'name', ref: nameRef },
            { name: 'category', ref: categoryRef },
            { name: 'keywords', ref: keywordsRef },
            { name: 'description', ref: descriptionRef },
            { name: 'price', ref: priceRef },
            { name: 'auth', ref: authRef },
            { name: 'accessURI', ref: accessURIRef },
            { name: 'accessKey', ref: accessKeyRef },
            { name: 'timeSlots', ref: timeSlotsRef },
            { name: 'timezone', ref: timezoneRef },
            { name: 'availableHoursStart', ref: availableHoursStartRef },
            { name: 'availableHoursEnd', ref: availableHoursEndRef },
            { name: 'maxConcurrentUsers', ref: maxConcurrentUsersRef },
            { name: 'termsOfUseUrl', ref: termsUrlRef },
            { name: 'termsOfUseSha', ref: termsShaRef },
            { name: 'uri', ref: uriRef },
            { name: 'images', ref: imageLinkRef },
            { name: 'docs', ref: docLinkRef },
        ],
        quick: [
            { name: 'price', ref: priceRef },
            { name: 'auth', ref: authRef },
            { name: 'accessURI', ref: accessURIRef },
            { name: 'accessKey', ref: accessKeyRef },
            { name: 'uri', ref: uriRef },
        ],
    };

    const relevantFields = fieldsToFocus[currentTab];

    for (const field of relevantFields) {
        if (currentErrors[field.name] && field.ref.current) {
            field.ref.current.focus();
            break;
        }
    }
  };

  const handleSubmitFull = async (e) => {
    e.preventDefault();
    const currentErrors = validateForm();
    try {
      if (Object.keys(currentErrors).length === 0) {
        const isFmuResource = localLab.resourceType === RESOURCE_TYPES.FMU
        const fmuAccessKey = isFmuResource
          ? (localLab.fmuFileName || '').trim()
          : localLab.accessKey
        let labForSubmit = {
          ...localLab,
          accessKey: fmuAccessKey,
        }

        if (isFmuResource) {
          try {
            const describeData = await verifyFmuReference(labForSubmit)
            labForSubmit = {
              ...labForSubmit,
              fmiVersion: describeData?.fmiVersion || '',
              simulationType: describeData?.simulationType || '',
              modelVariables: Array.isArray(describeData?.modelVariables) ? describeData.modelVariables : [],
              defaultStartTime: describeData?.defaultStartTime ?? null,
              defaultStopTime: describeData?.defaultStopTime ?? null,
              defaultStepSize: describeData?.defaultStepSize ?? null,
            }
            dispatch({ type: 'MERGE_LOCAL_LAB', value: {
              fmiVersion: labForSubmit.fmiVersion,
              simulationType: labForSubmit.simulationType,
              modelVariables: labForSubmit.modelVariables,
              defaultStartTime: labForSubmit.defaultStartTime,
              defaultStopTime: labForSubmit.defaultStopTime,
              defaultStepSize: labForSubmit.defaultStepSize,
            } })
          } catch (error) {
            const nextErrors = {
              ...currentErrors,
              fmuFileName: `FMU reference validation failed: ${error.message}`,
            }
            dispatch({ type: 'SET_FIELD', field: 'errors', value: nextErrors })
            focusFirstError(nextErrors, 'full')
            return
          }
        }
        // Normalize dates to MM/DD/YYYY format before submitting
        const normalizedLabData = normalizeLabDates(labForSubmit);
        
        // Pass uploaded temp files to parent for moving after mint
        if (onFilesUploaded && uploadedTempFiles.current.length > 0) {
          normalizedLabData._tempFiles = [...uploadedTempFiles.current];
          devLog.log('ðŸ“Ž Passing temp files to parent:', uploadedTempFiles.current);
        }
        
        await onSubmit(normalizedLabData); // Call to the original submit function with normalized dates
        // If onSubmit is successful, the files are no longer temporary and mustn't be deleted when closing
        // the modal
        uploadedTempFiles.current = [];
        devLog.log('LabModal: Form submitted successfully with normalized dates, modal remains open');
      } else {
        focusFirstError(currentErrors, 'full');
      }
    } catch (error) {
      devLog.error('Error saving lab:', error);
    }
  }

  const handleSubmitQuick = async (e) => {
    e.preventDefault();
    const currentErrors = validateForm();
    try {
      if (Object.keys(currentErrors).length === 0) {
        const fmuAccessKey =
          localLab.resourceType === RESOURCE_TYPES.FMU
            ? (localLab.fmuFileName || '').trim()
            : localLab.accessKey
        const labForSubmit = {
          ...localLab,
          accessKey: fmuAccessKey,
        }
        // Normalize dates to MM/DD/YYYY format before submitting
        const normalizedLabData = normalizeLabDates(labForSubmit);
        await onSubmit(normalizedLabData);
        devLog.log('LabModal: Quick form submitted successfully with normalized dates, modal remains open');
      } else {
        focusFirstError(currentErrors, 'quick');
      }
    } catch (error) {
      devLog.error('Error saving lab:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div onClick={handleClose} style={{ minHeight: "100vh" }}
      className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="mb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-4 text-black text-left">
                {lab?.id ? 'Edit Lab' : 'Add New Lab'}
              </h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => dispatch({ type: 'SET_FIELD', field: 'activeTab', value: 'full' })}
                  className={`px-4 py-2 rounded mr-2 ${activeTab === 'full'
                    ? 'bg-[#7875a8] text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  Full Setup
                </button>
                <button type="button" onClick={() => dispatch({ type: 'SET_FIELD', field: 'activeTab', value: 'quick' })}
                  className={`px-4 py-2 rounded ${activeTab === 'quick'
                    ? 'bg-[#7875a8] text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  Quick Setup
                </button>
              </div>
            </div>

            <section className="w-full sm:w-auto sm:min-w-[280px]">
              <h3 className="text-xl font-semibold text-gray-900 mb-4 sm:text-right">Resource Type</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'MERGE_LOCAL_LAB', value: { resourceType: RESOURCE_TYPES.LAB } })}
                  className={`px-2 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    localLab?.resourceType === RESOURCE_TYPES.LAB
                      ? 'border-[#7875a8] bg-[#7875a8]/10 text-[#7875a8]'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Monitor className="w-4 h-4" /> Real Lab
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'MERGE_LOCAL_LAB', value: { resourceType: RESOURCE_TYPES.FMU } })}
                  className={`px-2 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    localLab?.resourceType === RESOURCE_TYPES.FMU
                      ? 'border-[#7875a8] bg-[#7875a8]/10 text-[#7875a8]'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" /> Simulation
                  </span>
                </button>
              </div>
            </section>
          </div>
          <div className='mt-4'>
            {activeTab === 'full' && (
              <LabFormFullSetup localLab={localLab} isExternalURI={isExternalURI} imageInputType={imageInputType}
                setLocalLab={value => dispatch({ type: 'MERGE_LOCAL_LAB', value })} docInputType={docInputType}
                setImageInputType={value => dispatch({ type: 'SET_FIELD', field: 'imageInputType', value })}
                imageUrls={imageUrls} imageLinkRef={imageLinkRef} imageUploadRef={imageUploadRef} errors={errors}
                handleImageChange={handleImageChange} removeImage={removeImage} localImages={localImages}
                setDocInputType={value => dispatch({ type: 'SET_FIELD', field: 'docInputType', value })}
                onCancel={handleClose} docUrls={docUrls} docLinkRef={docLinkRef} docUploadRef={docUploadRef} 
                handleDocChange={handleDocChange} removeDoc={removeDoc} localDocs={localDocs} nameRef={nameRef}
                categoryRef={categoryRef} keywordsRef={keywordsRef} descriptionRef={descriptionRef} 
                priceRef={priceRef} authRef={authRef} accessURIRef={accessURIRef} accessKeyRef={accessKeyRef}
                timezoneRef={timezoneRef} timeSlotsRef={timeSlotsRef}
                availableHoursStartRef={availableHoursStartRef} availableHoursEndRef={availableHoursEndRef}
                maxConcurrentUsersRef={maxConcurrentUsersRef} termsUrlRef={termsUrlRef} termsShaRef={termsShaRef}
                onSubmit={handleSubmitFull} isUploading={uploadFileMutation.isPending}
              />
            )}
            {activeTab === 'quick' && (
              <LabFormQuickSetup setLocalLab={value => dispatch({ type: 'MERGE_LOCAL_LAB', value })} errors={errors}
                isLocalURI={isLocalURI} priceRef={priceRef} authRef={authRef} accessURIRef={accessURIRef} lab={lab}
                accessKeyRef={accessKeyRef} clickedToEditUri={clickedToEditUri} handleUriChange={handleUriChange}
                setClickedToEditUri={value => dispatch({ type: 'SET_FIELD', field: 'clickedToEditUri', value })}
                onSubmit={handleSubmitQuick} onCancel={handleClose} uriRef={uriRef} localLab={localLab}
                onSwitchToFullSetup={() => dispatch({ type: 'SET_FIELD', field: 'activeTab', value: 'full' })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
};

LabModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onFilesUploaded: PropTypes.func,
  lab: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    description: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    auth: PropTypes.string,
    images: PropTypes.array,
    docs: PropTypes.array
  }),
  maxId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}

