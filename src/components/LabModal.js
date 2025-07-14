"use client";
import React, { useEffect, useReducer, useRef, useCallback, useMemo } from 'react';
import LabFormFullSetup from '@/components/LabFormFullSetup';
import LabFormQuickSetup from '@/components/LabFormQuickSetup';
import { validateLabFull, validateLabQuick } from '@/utils/labValidation';

const initialState = (lab) => ({
  activeTab: 'full',
  imageInputType: 'link',
  docInputType: 'link',
  localImages: [],
  localDocs: [],
  imageUrls: [],
  docUrls: [],
  localLab: { ...lab },
  isExternalURI: false,
  errors: {},
  isLocalURI: false,
  clickedToEditUri: false,
});

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'MERGE_LOCAL_LAB':
      return { ...state, localLab: { ...state.localLab, ...action.value } };
    case 'RESET':
      return initialState(action.lab);
    default:
      return state;
  }
}

export default function LabModal({ isOpen, onClose, onSubmit, lab, maxId }) {
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
  const timeSlotsRef = useRef(null);
  const opensRef = useRef(null);
  const closesRef = useRef(null);
  const uriRef = useRef(null);
  const imageLinkRef = useRef(null);
  const docLinkRef = useRef(null);
  const uploadedTempFiles = useRef([]);
  const imageUploadRef = useRef(null);
  const docUploadRef = useRef(null);

  const currentLabId = lab.id || maxId + 1;
  const jsonFileRegex = useMemo(() => new RegExp(/^[\w\-._/]+\.json$/i), []);

  const uploadFile = async (file, destinationFolder, labId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('destinationFolder', destinationFolder);
    formData.append('labId', labId);

    const response = await fetch('/api/provider/uploadFile', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error al uploading: ${response.statusText}`);
    }

    const data = await response.json();
    let filePath = data.filePath;

    // Keep track of uploaded temporal files
    uploadedTempFiles.current.push(filePath);
    return filePath;
  };

  const handleClose = useCallback(() => {
    dispatch({ type: 'RESET', lab });
    onClose();
  }, [lab, onClose]);

  const deleteFile = useCallback(async (filePath) => {
    const formData = new FormData();
    formData.append('filePath', filePath);
    formData.append('deletingLab', 'false');

    const response = await fetch('/api/provider/deleteFile', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to delete file: ${errorData.details || response.statusText}`);
    }
    console.log(`Temporal file ${filePath} deleted successfully.`);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Delete uploaded temporal files
      Promise.allSettled(uploadedTempFiles.current.map(filePath => deleteFile(filePath)))
        .then(results => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.error(`Failed deleting ${uploadedTempFiles.current[index]}:`, result.reason);
            }
          });
          uploadedTempFiles.current = [];
        });

      dispatch({ type: 'SET_FIELD', field: 'localImages', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'localDocs', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'docUrls', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'isExternalURI', value: false });
      dispatch({ type: 'SET_FIELD', field: 'isLocalURI', value: false });
      dispatch({ type: 'SET_FIELD', field: 'clickedToEditUri', value: false });
      dispatch({ type: 'SET_FIELD', field: 'errors', value: {} });
      return;
    }

    uploadedTempFiles.current = [];

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose, deleteFile]);

  // Load existing images and docs for preview when the modal opens
  useEffect(() => {
    if (isOpen) {
      dispatch({ type: 'MERGE_LOCAL_LAB', value: lab ? { ...lab } : {} });
      const hasExternalUri = !!(lab?.uri && (lab.uri.startsWith('http://') || lab.uri.startsWith('https://')));
      dispatch({ type: 'SET_FIELD', field: 'isExternalURI', value: hasExternalUri });
      const hasLocalUri = !!(lab?.uri && !hasExternalUri && jsonFileRegex.test(lab.uri));
      dispatch({ type: 'SET_FIELD', field: 'isLocalURI', value: hasLocalUri });
      dispatch({ type: 'SET_FIELD', field: 'clickedToEditUri', value: false });
    }
    if (isOpen && lab?.images?.length > 0) {
      const initialImageUrls = lab.images.map(imageUrl => {
        if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
          return imageUrl;
        }
        return imageUrl;
      });
      dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: initialImageUrls });
      dispatch({ type: 'SET_FIELD', field: 'imageInputType', value: 'upload' });
    } else {
      dispatch({ type: 'SET_FIELD', field: 'imageInputType', value: 'link' });
      dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: [] });
    }

    if (isOpen && lab?.docs?.length > 0) {
      dispatch({ type: 'SET_FIELD', field: 'docUrls', value: lab.docs });
      dispatch({ type: 'SET_FIELD', field: 'docInputType', value: 'upload' });
    } else {
      dispatch({ type: 'SET_FIELD', field: 'docInputType', value: 'link' });
      dispatch({ type: 'SET_FIELD', field: 'docUrls', value: [] });
    }
  }, [isOpen, lab, jsonFileRegex]);

  const handleImageChange = useCallback((e) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            // Filter out non-image files.
            const imageFiles = files.filter(file => file.type.startsWith('image/'));

            if (!currentLabId) {
              console.error("No valid lab ID available for image upload. Lab:", lab, "Missing ID:", currentLabId);
              return;
            }

            if (imageFiles.length !== files.length) {
                alert('Only valid image files are allowed: (JPEG, PNG, GIF, etc.).');
                // Only use the valid images and discard the rest
                dispatch({ type: 'SET_FIELD', field: 'localImages', value: [...localImages, ...imageFiles] });

                // Create URLs for previewing immediately.
                const newImageUrls = imageFiles.map(file => URL.createObjectURL(file));
                dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: [...imageUrls, ...newImageUrls] });

                // Upload files *asynchronously* and update lab.images
                const uploadImages = async () => {
                    try {
                        const uploadedPaths = await Promise.all(
                            imageFiles.map(async (file) => {
                                return await uploadFile(file, 'images', currentLabId);
                            })
                        );
                        dispatch({
                            type: 'MERGE_LOCAL_LAB',
                            value: {
                              images: [...(localLab.images || []), ...uploadedPaths],
                            },
                        });
                    } catch (error) {
                        console.error("Error uploading", error);
                    }
                }
                uploadImages();

            } else {
                dispatch({ type: 'SET_FIELD', field: 'localImages', value: [...localImages, ...files] });
                const newImageUrls = files.map(file => URL.createObjectURL(file));
                dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: [...imageUrls, ...newImageUrls] });

                const uploadImages = async () => {
                    try {
                        const uploadedPaths = await Promise.all(
                            files.map(async (file) => {
                                return await uploadFile(file, 'images', currentLabId);
                            })
                        );
                        dispatch({
                            type: 'MERGE_LOCAL_LAB',
                            value: {
                              images: [...(localLab.images || []), ...uploadedPaths],
                            },
                        });
                    } catch (error) {
                        console.error("Error uploading", error);
                    }
                }
                uploadImages();
            }
        }
    }, [localLab, localImages, imageUrls, currentLabId, lab]);

  const handleDocChange = useCallback(async (e) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      // Filter out non-PDF files.
      const pdfFiles = files.filter(file => file.type === 'application/pdf');

      if (pdfFiles.length !== files.length) {
        alert('Only PDF files are allowed for documents.');
        // Only use the valid PDFs and discard the rest
        dispatch({ type: 'SET_FIELD', field: 'localDocs', value: [...localDocs, ...pdfFiles]});

        try {
          const newDocUrls = await Promise.all(
            pdfFiles.map(async (file) => {
              const filePath = await uploadFile(file, 'docs', currentLabId);
              return filePath;
            })
          );

          dispatch({
            type: 'MERGE_LOCAL_LAB',
            value: {
              docs: [...(localLab.docs || []), ...newDocUrls],
            },
          });
        } catch (error) {
          console.error("Error uploading docs", error);
        }
      } else { // If all files are PDFs
        dispatch({ type: 'SET_FIELD', field: 'localDocs', value: [...localDocs, ...files] });

        try {
          const newDocUrls = await Promise.all(
            files.map(async (file) => {
              const filePath = await uploadFile(file, 'docs', currentLabId);
              return filePath;
            })
          );

          dispatch({
            type: 'MERGE_LOCAL_LAB',
            value: {
              docs: [...(localLab.docs || []), ...newDocUrls],
            },
          });
        } catch (error) {
          console.error("Error uploading docs", error);
        }
      }
    }
  }, [localLab, localDocs, currentLabId]);

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
      const formDatatoDelete = new FormData();
      formDatatoDelete.append('filePath', filePathToDelete);
      fetch('/api/provider/deleteFile', {
        method: 'POST',
        body: formDatatoDelete,
      }).then(response => {
        if (!response.ok) {
          console.error('Failed to delete image file:', filePathToDelete);
        }
      }).catch(error => {
        console.error('Error deleting image file:', error);
      });
    }

    dispatch({
      type: 'MERGE_LOCAL_LAB',
      value: { images: localLab.images.filter((_, i) => i !== index) },
    });
    dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: newUrls });
  };

  const removeDoc = (index) => {
    const newDocs = localDocs.filter((_, i) => i !== index);
    dispatch({ type: 'SET_FIELD', field: 'localDocs', value: newDocs });

    const newUrls = docUrls.filter((_, i) => i !== index);
    const urlToRemove = docUrls[index];
    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove);
    }

    if (localLab.docs[index]) {
      const filePathToDelete = localLab.docs[index].startsWith('/')
        ? localLab.docs[index].substring(1)
        : localLab.docs[index];
      const formDatatoDelete = new FormData();
      formDatatoDelete.append('filePath', filePathToDelete);
      fetch('/api/provider/deleteFile', {
        method: 'POST',
        body: formDatatoDelete,
      }).then(response => {
        if (!response.ok) {
          console.error('Failed to delete doc file:', filePathToDelete);
        }
      }).catch(error => {
        console.error('Error deleting doc file:', error);
      });
    }

    dispatch({
      type: 'MERGE_LOCAL_LAB',
      value: { docs: localLab.docs.filter((_, i) => i !== index) },
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

    // --- Case 1: Was a local URI, attempting to change its path/name ---
    if ((isLocalURI || (originalLabUri && jsonFileRegex.test(originalLabUri))) && newIsLocal && 
    newUri !== originalLabUri) {
      // Revert the URI to its original value and grey out.
      dispatch({ type: 'MERGE_LOCAL_LAB', value: { uri: originalLabUri } });
      dispatch({ type: 'SET_FIELD', field: 'clickedToEditUri', value: false });
      dispatch({ type: 'SET_FIELD', field: 'isExternalURI', value: false });
      dispatch({ type: 'SET_FIELD', field: 'isLocalURI', value: true });
      if (!newUri.endsWith('.json')) {
        dispatch({ type: 'SET_FIELD', field: 'errors', value: newErrors });
      } else{
        dispatch({ type: 'SET_FIELD', field: 'errors', value: { uri: '' } });
      }
      return;
    } else if (!newIsExternal && !newIsLocal && clickedToEditUri && newUri !== '') {
      newErrors.uri = 'It must be an external URL';
      dispatch({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    } else if (newIsExternal && clickedToEditUri && newErrors.uri === 'It must be an external URL') {
      delete newErrors.uri;
      dispatch({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    } else if (newUri == '' && clickedToEditUri) {
      newErrors.uri = 'Lab Data URL is required';
      dispatch({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    }

    // --- Update 'localLab.uri' and states ---
    // If we reached here, the change is either allowed or it's an external link
    dispatch({ type: 'MERGE_LOCAL_LAB', value: { uri: newUri } });
    dispatch({ type: 'SET_FIELD', field: 'isExternalURI', value: newIsExternal });
    dispatch({ type: 'SET_FIELD', field: 'isLocalURI', value: newIsLocal });

    // --- Case 2: Introducing an external link (and clearing Full Setup fields) ---
    if (newIsExternal && !isExternalURI) {
      dispatch({
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
      dispatch({ type: 'SET_FIELD', field: 'imageUrls', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'docUrls', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'localImages', value: [] });
      dispatch({ type: 'SET_FIELD', field: 'localDocs', value: [] });

      // Delete any temporarily uploaded files from the server
      if (uploadedTempFiles.current.length > 0) {
        Promise.allSettled(uploadedTempFiles.current.map(filePath => deleteFile(filePath)))
          .then(results => {
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                  console.error(`Failed deleting temp file ${uploadedTempFiles.current[index]}:`, result.reason);
              }
            });
            uploadedTempFiles.current = [];
        });
      }
      newErrors.uri = 'Introducing a link to a JSON file will replace the data in Full Setup with the ' +
                      'information contained in the linked JSON';
      dispatch({ type: 'SET_FIELD', field: 'errors', value: newErrors });
    }
  };

  useEffect(() => {
    dispatch({ type: 'SET_FIELD', field: 'errors', value: {} });
  }, [activeTab]);

  const validateForm = () => {
    let newErrors = {};
    if (activeTab === 'full') {
      if (!isExternalURI) {
        newErrors = validateLabFull(localLab, { imageInputType, docInputType });
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
            { name: 'opens', ref: opensRef },
            { name: 'closes', ref: closesRef },
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
        await onSubmit(localLab); // Call to the original submit function
        // If onSubmit is successful, the files are no longer temporary and mustn't be deleted when closing
        // the modal
        uploadedTempFiles.current = [];
        handleClose();
      } else {
        focusFirstError(currentErrors, 'full');
      }
    } catch (error) {
      console.error('Error saving lab:', error);
    }
  }

  const handleSubmitQuick = async (e) => {
    e.preventDefault();
    const currentErrors = validateForm();
    if (Object.keys(currentErrors).length === 0) {
      await onSubmit(localLab);
    } else {
      focusFirstError(currentErrors, 'quick');
    }
  };

  if (!isOpen) return null;

  return (
    <div onClick={handleClose} style={{ minHeight: "100vh" }}
      className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4 text-black">
          {lab?.id ? 'Edit Lab' : 'Add New Lab'}
        </h2>
        <div className="mb-4">
          <div className="flex">
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
                timeSlotsRef={timeSlotsRef} opensRef={opensRef} closesRef={closesRef} onSubmit={handleSubmitFull}
              />
            )}
            {activeTab === 'quick' && (
              <LabFormQuickSetup setLocalLab={value => dispatch({ type: 'MERGE_LOCAL_LAB', value })} errors={errors}
                isLocalURI={isLocalURI} priceRef={priceRef} authRef={authRef} accessURIRef={accessURIRef} lab={lab}
                accessKeyRef={accessKeyRef} clickedToEditUri={clickedToEditUri} handleUriChange={handleUriChange}
                setClickedToEditUri={value => dispatch({ type: 'SET_FIELD', field: 'clickedToEditUri', value })}
                onSubmit={handleSubmitQuick} onCancel={handleClose} uriRef={uriRef} localLab={localLab}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
};