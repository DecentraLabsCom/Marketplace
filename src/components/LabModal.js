"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import LabFormFullSetup from './LabFormFullSetup';
import LabFormQuickSetup from './LabFormQuickSetup';
import { validateLabFull, validateLabQuick } from '../utils/labValidation';

export default function LabModal({ isOpen, onClose, onSubmit, lab, maxId }) {
  const [activeTab, setActiveTab] = useState('full');
  const [imageInputType, setImageInputType] = useState('link');
  const [docInputType, setDocInputType] = useState('link');
  const [localImages, setLocalImages] = useState([]);
  const [localDocs, setLocalDocs] = useState([]);
  const [imageUrls, setImageUrls] = useState([]);
  const [docUrls, setDocUrls] = useState([]);
  const [localLab, setLocalLab] = useState({ ...lab });
  const [isExternalURI, setIsExternalURI] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLocalURI, setIsLocalURI] = useState(false);
  const [hasClickedToEnableUri, setHasClickedToEnableUri] = useState(false);

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
  const jsonFileRegex = new RegExp(/^[\w\-._/]+\.json$/i);

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

      setLocalImages([]);
      setLocalDocs([]);
      setImageUrls([]);
      setDocUrls([]);
      setIsExternalURI(false);
      setIsLocalURI(false);
      setHasClickedToEnableUri(false);
      setErrors({});
      return;
    }

    uploadedTempFiles.current = [];

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, deleteFile]);

  // Load existing images and docs for preview when the modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalLab(lab ? { ...lab } : {});
      const hasExternalUri = !!(lab?.uri && (lab.uri.startsWith('http://') || lab.uri.startsWith('https://')));
      setIsExternalURI(hasExternalUri);
      const hasLocalUri = !!(lab?.uri && !hasExternalUri && jsonFileRegex.test(lab.uri));
      setIsLocalURI(hasLocalUri);
      setHasClickedToEnableUri(false);
    }
    if (isOpen && lab?.images?.length > 0) {
      const initialImageUrls = lab.images.map(imageUrl => {
        if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
          return imageUrl;
        }
        return imageUrl;
      });
      setImageUrls(initialImageUrls);
      setImageInputType('upload');
    } else {
      setImageInputType('link');
      setImageUrls([]);
    }

    if (isOpen && lab?.docs?.length > 0) {
      setDocUrls(lab.docs);
      setDocInputType('upload');
    } else {
      setDocInputType('link');
      setDocUrls([]);
    }
  }, [isOpen, lab]);

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
                setLocalImages(prevLocalImages => [...prevLocalImages, ...imageFiles]);

                // Create URLs for previewing immediately.
                const newImageUrls = imageFiles.map(file => URL.createObjectURL(file));
                setImageUrls(prevImageUrls => [...prevImageUrls, ...newImageUrls]);

                // Upload files *asynchronously* and update lab.images
                const uploadImages = async () => {
                    try {
                        const uploadedPaths = await Promise.all(
                            imageFiles.map(async (file) => {
                                return await uploadFile(file, 'images', currentLabId);
                            })
                        );
                        setLocalLab(prevLab => {
                            const currentImages = prevLab.images || [];
                            return {
                                ...prevLab,
                                images: [...currentImages, ...uploadedPaths]  // Store file paths
                            };
                        });
                    } catch (error) {
                        console.error("Error uploading", error);
                    }
                }
                uploadImages();

            } else {
                setLocalImages(prevLocalImages => [...prevLocalImages, ...files]);
                const newImageUrls = files.map(file => URL.createObjectURL(file));
                setImageUrls(prevImageUrls => [...prevImageUrls, ...newImageUrls]);

                const uploadImages = async () => {
                    try {
                        const uploadedPaths = await Promise.all(
                            files.map(async (file) => {
                                return await uploadFile(file, 'images', currentLabId);
                            })
                        );
                        setLocalLab(prevLab => {
                            const currentImages = prevLab.images || [];
                            return {
                                ...prevLab,
                                images: [...currentImages, ...uploadedPaths]
                            };
                        });
                    } catch (error) {
                        console.error("Error uploading", error);
                    }
                }
                uploadImages();
            }
        }
    }, [setLocalLab, lab.id, maxId]);

  const handleDocChange = useCallback(async (e) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      // Filter out non-PDF files.
      const pdfFiles = files.filter(file => file.type === 'application/pdf');

      if (pdfFiles.length !== files.length) {
        alert('Only PDF files are allowed for documents.');
        // Only use the valid PDFs and discard the rest
        setLocalDocs(prevLocalDocs => [...prevLocalDocs, ...pdfFiles]);

        try {
          const newDocUrls = await Promise.all(
            pdfFiles.map(async (file) => {
              const filePath = await uploadFile(file, 'docs', currentLabId);
              return filePath;
            })
          );

          setLocalLab(prevLab => {
            const currentDocs = prevLab.docs || [];
            return {
              ...prevLab,
              docs: [...currentDocs, ...newDocUrls]
            };
          });
        } catch (error) {
          console.error("Error uploading docs", error);
        }
      } else { // If all files are PDFs
        setLocalDocs(prevLocalDocs => [...prevLocalDocs, ...files]);

        try {
          const newDocUrls = await Promise.all(
            files.map(async (file) => {
              const filePath = await uploadFile(file, 'docs', currentLabId);
              return filePath;
            })
          );

          setLocalLab(prevLab => {
            const currentDocs = prevLab.docs || [];
            return {
              ...prevLab,
              docs: [...currentDocs, ...newDocUrls]
            };
          });
        } catch (error) {
          console.error("Error uploading docs", error);
        }
      }
    }
  }, [setLocalLab, lab.id, maxId]);

  const removeImage = (index) => {
    setLocalImages(prevImages => {
      const newImages = prevImages.filter((_, i) => i !== index);
      return newImages;
    });

    setImageUrls(prevUrls => {
      const newUrls = prevUrls.filter((_, i) => i !== index);
      const urlToRemove = prevUrls[index];
      if (urlToRemove) {
        URL.revokeObjectURL(urlToRemove);
      }

      setLocalLab(prevLab => {
        const imageToDelete = prevLab.images[index]; // Get the path to delete
        const updatedImages = prevLab.images.filter((_, i) => i !== index);
        
        // Delete the file from the server
        if (imageToDelete && !imageToDelete.startsWith('http')) {

          // Construct filePath relative to /public
          const filePathToDelete = imageToDelete.startsWith('/') ? imageToDelete.substring(1) : imageToDelete;
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

        return { ...prevLab, images: updatedImages };
      });
      return newUrls;
    });
  };

  const removeDoc = (index) => {
    setLocalDocs(prevDocs => {
      const newDocs = prevDocs.filter((_, i) => i !== index);
      return newDocs
    });
    setDocUrls(prevUrls => {
      const newUrls = prevUrls.filter((_, i) => i !== index);
      const urlToRemove = prevUrls[index];
      if (urlToRemove) {
        URL.revokeObjectURL(urlToRemove);
      }

      setLocalLab(prevLab => {
        const docToDelete = prevLab.docs[index]; // Get the path to delete
        const updatedDocs = prevLab.docs.filter((_, i) => i !== index);

        // Delete the file from the server
        if (docToDelete) {
          // Construct filePath relative to /public
          const filePathToDelete = docToDelete.startsWith('/') ? docToDelete.substring(1) : docToDelete;
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
        return { ...prevLab, docs: updatedDocs };
      });
    return newUrls;
    });
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
      setLocalLab(prev => ({ ...prev, uri: originalLabUri }));
      setHasClickedToEnableUri(false); // Grey out again
      newErrors.uri = 'Name changes to local JSON file are not allowed and will be ignored';
      setErrors(newErrors);
      setIsExternalURI(false);
      setIsLocalURI(true);
      return;
    } else if (newErrors.uri === 'Name changes to local JSON file are not allowed and will be ignored' && 
      newUri === originalLabUri) {
      // If user retyped the original URI, clear the specific error
      delete newErrors.uri;
      setErrors(newErrors);
    } else if (!newIsExternal && !newIsLocal && hasClickedToEnableUri && newUri !== '') {
      newErrors.uri = 'It must be an external URL';
      setErrors(newErrors);
    } else if (newIsExternal && hasClickedToEnableUri && newErrors.uri === 'It must be an external URL') {
      delete newErrors.uri;
      setErrors(newErrors);
    } else if (newUri == '' && hasClickedToEnableUri) {
      newErrors.uri = 'Lab Data URL is required';
      setErrors(newErrors);
    }

    // --- Update 'localLab.uri' and states ---
    // If we reached here, the change is either allowed or it's an external link
    setLocalLab(prev => ({ ...prev, uri: newUri }));
    setIsExternalURI(newIsExternal);
    setIsLocalURI(newIsLocal);

    // --- Case 2: Introducing an external link (and clearing Full Setup fields) ---
    if (newIsExternal && !isExternalURI) {
      setLocalLab(prevLab => ({
        ...prevLab,
        name: '',
        category: '',
        keywords: [],
        description: '',
        timeSlots: [],
        opens: '',
        closes: '',
        images: [],
        docs: [],
      }));

      // Clear image and document previews and associated local states
      setImageUrls([]);
      setDocUrls([]);
      setLocalImages([]);
      setLocalDocs([]);

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
      setErrors(newErrors);
    }
  };

  useEffect(() => {
    setErrors({});
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
    setErrors(newErrors);
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
        onClose();
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
    <div onClick={onClose} style={{ minHeight: "100vh" }}
      className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4 text-black">
          {lab?.id ? 'Edit Lab' : 'Add New Lab'}
        </h2>
        <div className="mb-4">
          <div className="flex">
            <button type="button" onClick={() => setActiveTab('full')}
              className={`px-4 py-2 rounded mr-2 ${activeTab === 'full'
                ? 'bg-[#7875a8] text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Full Setup
            </button>
            <button type="button" onClick={() => setActiveTab('quick')}
              className={`px-4 py-2 rounded ${activeTab === 'quick'
                ? 'bg-[#7875a8] text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Quick Setup
            </button>
          </div>
          <div className='mt-4'>
            {activeTab === 'full' && (
              <LabFormFullSetup localLab={localLab} setLocalLab={setLocalLab} errors={errors}
                isExternalURI={isExternalURI} imageInputType={imageInputType} setImageInputType={setImageInputType}
                imageUrls={imageUrls} imageLinkRef={imageLinkRef} imageUploadRef={imageUploadRef}
                handleImageChange={handleImageChange} removeImage={removeImage} localImages={localImages}
                docInputType={docInputType} setDocInputType={setDocInputType} docUrls={docUrls}
                docLinkRef={docLinkRef} docUploadRef={docUploadRef} handleDocChange={handleDocChange}
                removeDoc={removeDoc} localDocs={localDocs} nameRef={nameRef} categoryRef={categoryRef} 
                keywordsRef={keywordsRef} descriptionRef={descriptionRef} priceRef={priceRef} authRef={authRef} 
                accessURIRef={accessURIRef} accessKeyRef={accessKeyRef} timeSlotsRef={timeSlotsRef} 
                opensRef={opensRef} closesRef={closesRef} onSubmit={handleSubmitFull} onCancel={onClose}
              />
            )}
            {activeTab === 'quick' && (
              <LabFormQuickSetup localLab={localLab} setLocalLab={setLocalLab} errors={errors}
                isLocalURI={isLocalURI} priceRef={priceRef} authRef={authRef} accessURIRef={accessURIRef}
                accessKeyRef={accessKeyRef} uriRef={uriRef} hasClickedToEnableUri={hasClickedToEnableUri}
                setHasClickedToEnableUri={setHasClickedToEnableUri} handleUriChange={handleUriChange}
                onSubmit={handleSubmitQuick} onCancel={onClose} lab={lab}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
};