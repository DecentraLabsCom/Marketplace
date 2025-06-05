"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { UploadCloud, Link, XCircle } from 'lucide-react';
import ImagePreviewList from './ImagePreviewList.js';
import DocPreviewList from './DocPreviewList.js';

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
  const uploadedTempFiles = useRef([]);
  const imageUploadRef = useRef(null);
  const docUploadRef = useRef(null);
  const currentLabId = lab.id || maxId + 1;
  const [errors, setErrors] = useState({});
  const [isLocalURI, setIsLocalURI] = useState(false);
  const jsonFileRegex = new RegExp(/^[\w\-\._\/]+\.json$/i);
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
      // Delete uploeaded temporal files
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
    setLocalLab({ ...localLab, uri: newUri });
    
    const startsWithProtocol = newUri.startsWith('http://') || newUri.startsWith('https://') || newUri.startsWith('ftp://');
    setIsExternalURI(!!(newUri && startsWithProtocol));

    // Determine if it's a local JSON URI: Not an external protocol AND matches local JSON regex
    setIsLocalURI(!!(newUri && !startsWithProtocol && jsonFileRegex.test(newUri)));
  };

  useEffect(() => {
    setErrors({});
  }, [activeTab]);

  // Form validation
  const validateForm = () => {
    const newErrors = {};
    const urlRegex = new RegExp(/^(ftp|http|https):\/\/[^ "]+$/);

    if (activeTab === 'full') {
      if (!isExternalURI) {
        if (!localLab.name?.trim()) newErrors.name = 'Lab name is required';
        if (!localLab.category?.trim()) newErrors.category = 'Category is required';
        if (!localLab.description?.trim()) newErrors.description = 'Description is required';
        if (localLab.price === '' || localLab.price === undefined || localLab.price === null) {
          newErrors.price = 'Price is required';
        } else {
          const priceNum = parseFloat(localLab.price);
          if (isNaN(priceNum) || priceNum < 0) {
            newErrors.price = 'Price must be a positive number or zero';
          }
        }
        if (!localLab.auth?.trim()) {
          newErrors.auth = 'Authentication URL is required';
        } else if (!urlRegex.test(localLab.auth)) {
          newErrors.auth = 'Invalid Authentication URL format';
        }
        if (!localLab.accessURI?.trim()) {
          newErrors.accessURI = 'Access URI is required';
        } else if (!urlRegex.test(localLab.accessURI)) {
          newErrors.accessURI = 'Invalid Access URI format';
        }
        if (!localLab.accessKey?.trim()) newErrors.accessKey = 'Access Key is required';

        const dateRegex = new RegExp(/^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/);

        if (!localLab.opens?.trim()) {
          newErrors.opens = 'Opening date is required';
        } else if (!dateRegex.test(localLab.opens)) {
          newErrors.opens = 'Invalid opening date format (must be MM/DD/YYYY)';
        }
        if (!localLab.closes?.trim()) {
          newErrors.closes = 'Closing date is required';
        } else if (!dateRegex.test(localLab.closes)) {
          newErrors.closes = 'Invalid closing date format (must be MM/DD/YYYY)';
        }
        if (!localLab.timeSlots || localLab.timeSlots.length === 0 || localLab.timeSlots.every(slot => isNaN(Number(slot)) || Number(slot) <= 0)) {
          newErrors.timeSlots = 'At least one valid time slot (positive number) must be selected';
        }
        if (!localLab.keywords || localLab.keywords.length === 0 || localLab.keywords.every(k => !k.trim())) {
          newErrors.keywords = 'At least one keyword must be added';
        }
        
        // Date comparison validation (only if both dates pass format check and are not empty)
        if (!newErrors.opens && !newErrors.closes &&
            localLab.opens?.trim() && localLab.closes?.trim()) {
          const opensDate = new Date(localLab.opens);
          const closesDate = new Date(localLab.closes);
          if (closesDate.getTime() < opensDate.getTime()) {
            newErrors.closes = 'Closing date must be after or equal to opening date';
          }
        }

        const imageExtensionRegex = new RegExp(/\.(jpeg|jpg|gif|png|webp|svg|bmp|tiff|tif)$/i);
        const pdfExtensionRegex = new RegExp(/\.pdf$/i);

        // Image and Document link validations
        if (imageInputType === 'link' && Array.isArray(localLab.images)) {
          localLab.images.forEach((imageUrl, index) => {
            if (imageUrl.trim()) {
              if (!imageExtensionRegex.test(imageUrl.trim())) {
                newErrors.images = newErrors.images || `Image link must end with a valid image extension (e.g., .jpg, .png)`;
              }
            }
          });
        }

        if (docInputType === 'link' && Array.isArray(localLab.docs)) {
          localLab.docs.forEach((docUrl, index) => {
            if (docUrl.trim()) {
              if (!pdfExtensionRegex.test(docUrl.trim())) {
                newErrors.docs = newErrors.docs || `Document link must end with ".pdf"`;
              }
            }
          });
        }
      }
    } else if (activeTab === 'quick') {
      if (localLab.price === '' || localLab.price === undefined || localLab.price === null) {
        newErrors.price = 'Price is required';
      } else {
        const priceNum = parseFloat(localLab.price);
        if (isNaN(priceNum) || priceNum < 0) {
          newErrors.price = 'Price must be a positive number or zero';
        }
      }
      if (!localLab.auth?.trim()) {
        newErrors.auth = 'Authentication URL is required';
      } else if (!urlRegex.test(localLab.auth)) {
        newErrors.auth = 'Invalid Authentication URL format';
      }
      if (!localLab.accessURI?.trim()) {
        newErrors.accessURI = 'Access URI is required';
      } else if (!urlRegex.test(localLab.accessURI)) {
        newErrors.accessURI = 'Invalid Access URI format';
      }
      if (!localLab.accessKey?.trim()) newErrors.accessKey = 'Access Key is required';
      if (!localLab.uri?.trim()) {
        newErrors.uri = 'Lab Data URL is required';
      } else {
        // If not empty, check format based on whether it looks like an external URL
        const isExternalUrlAttempt = localLab.uri.startsWith('http://') || localLab.uri.startsWith('https://') || localLab.uri.startsWith('ftp://');

        if (isExternalUrlAttempt) {
          if (!urlRegex.test(localLab.uri)) {
            newErrors.uri = 'Invalid external URI format. Must be a valid URL starting with http(s):// or ftp://';
          }
        } else {
          // If not an external URL attempt, assume it's a local JSON file path
          newErrors.uri = 'It must be an external URL';
        }
      }
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
        // If onSubmit is successful, the files are no longer temporary and mustn't be deleted when closing the modal
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
            <button
              type="button"
              className={`px-4 py-2 rounded mr-2 ${activeTab === 'full'
                ? 'bg-[#7875a8] text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              onClick={() => setActiveTab('full')}
            >
              Full Data
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded ${activeTab === 'quick'
                ? 'bg-[#7875a8] text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              onClick={() => setActiveTab('quick')}
            >
              Quick Setup
            </button>
          </div>
          {isExternalURI && activeTab === 'full' && (
            <div className='mt-4 flex justify-center'>
              <span className="text-sm text-red-500 font-medium">
                To edit these fields, first remove the link to the lab data in Quick Setup
              </span>
            </div>
          )}
          {isLocalURI && activeTab === 'quick' && (
            <div className='mt-4 flex justify-center'>
              <span className="text-sm text-red-500 font-medium">
                To edit these fields, click on the JSON file field and add an external URL
              </span>
            </div>
          )}
          <div className='mt-4'>
            {activeTab === 'full' && (
              <form className="space-y-4 text-gray-600" onSubmit={handleSubmitFull}>
                <input
                  type="text"
                  placeholder="Lab Name"
                  value={localLab.name}
                  onChange={(e) => setLocalLab({ ...localLab, name: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={nameRef}
                />
                {errors.name && <p className="text-red-500 text-sm !mt-1">{errors.name}</p>}
                <input
                  type="text"
                  placeholder="Category"
                  value={localLab.category}
                  onChange={(e) => setLocalLab({ ...localLab, category: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={categoryRef}
                />
                {errors.category && <p className="text-red-500 text-sm !mt-1">{errors.category}</p>}
                <input
                  type="text"
                  placeholder="Keywords (comma-separated)"
                  value={localLab.keywords.join(',')}
                  onChange={(e) =>
                    setLocalLab({ ...localLab, keywords: e.target.value.split(',') })
                  }
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={keywordsRef}
                />
                {errors.keywords && <p className="text-red-500 text-sm !mt-1">{errors.keywords}</p>}
                <textarea
                  placeholder="Description"
                  value={localLab.description}
                  onChange={(e) => setLocalLab({ ...localLab, description: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={descriptionRef}
                />
                {errors.description && <p className="text-red-500 text-sm !mt-[-2px]">{errors.description}</p>}
                <input
                  type="number"
                  placeholder="Price"
                  value={localLab.price}
                  onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={priceRef}
                />
                {errors.price && <p className="text-red-500 text-sm !mt-1">{errors.price}</p>}
                <input
                  type="text"
                  placeholder="Auth URL"
                  value={localLab.auth}
                  onChange={(e) => setLocalLab({ ...localLab, auth: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={authRef}
                />
                {errors.auth && <p className="text-red-500 text-sm !mt-1">{errors.auth}</p>}
                <input
                  type="text"
                  placeholder="Access URI"
                  value={localLab.accessURI || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={accessURIRef}
                />
                {errors.accessURI && <p className="text-red-500 text-sm !mt-1">{errors.accessURI}</p>}
                <input
                  type="text"
                  placeholder="Access Key"
                  value={localLab.accessKey || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={accessKeyRef}
                />
                {errors.accessKey && <p className="text-red-500 text-sm !mt-1">{errors.accessKey}</p>}
                <input
                  type="text"
                  placeholder="Time Slots (comma-separated)"
                  value={Array.isArray(localLab.timeSlots) ? localLab.timeSlots.join(',') : ''}
                  onChange={(e) =>
                    setLocalLab({ ...localLab, timeSlots: e.target.value.split(',') })
                  }
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={timeSlotsRef}
                />
                {errors.timeSlots && <p className="text-red-500 text-sm !mt-1">{errors.timeSlots}</p>}
                <input
                  type="text"
                  placeholder="Opens (e.g. 08/31/2025)"
                  value={localLab.opens || ''}
                  onChange={(e) => setLocalLab({ ...localLab, opens: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={opensRef}
                />
                {errors.opens && <p className="text-red-500 text-sm !mt-1">{errors.opens}</p>}
                <input
                  type="text"
                  placeholder="Closes (e.g. 12/31/2025)"
                  value={localLab.closes || ''}
                  onChange={(e) => setLocalLab({ ...localLab, closes: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isExternalURI}
                  ref={closesRef}
                />
                {errors.closes && <p className="text-red-500 text-sm !mt-1">{errors.closes}</p>}

                {/* Image Input */}
                <div className="space-y-2">
                  <h4 className="font-semibold">Images</h4>
                  <div className="flex">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded mr-2 ${imageInputType === 'link'
                        ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' +
                          'disabled:cursor-not-allowed disabled:border-gray-300'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' +
                          'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
                      onClick={() => setImageInputType('link')}
                      disabled={isExternalURI}
                    >
                      <div className='flex items-center justify-center'>
                        <Link className="mr-2 ml-[-2px] w-4" />
                        <span>Link</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded ${imageInputType === 'upload'
                        ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' +
                          'disabled:cursor-not-allowed disabled:border-gray-300'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' +
                          'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
                      onClick={() => setImageInputType('upload')}
                      disabled={isExternalURI}
                    >
                      <div className='flex items-center justify-center'>
                        <UploadCloud className="mr-2 ml-[-2px] w-4" />
                        <span>Upload</span>
                      </div>
                    </button>
                  </div>
                  {imageInputType === 'link' && (
                    <input
                      type="text"
                      placeholder="Image URLs (comma-separated)"
                      value={Array.isArray(localLab.images) ? localLab.images.join(',') : ''}
                      onChange={(e) =>
                        setLocalLab({ ...localLab, images: e.target.value.split(',') })
                      }
                      className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
                      disabled:cursor-not-allowed disabled:border-gray-300"
                      disabled={isExternalURI}
                      ref={imageLinkRef}
                    />
                  )}
                  {errors.images && <p className="text-red-500 text-sm mt-1">{errors.images}</p>}
                  {imageInputType === 'upload' && (
                    <>
                      <input
                        type="file"
                        multiple
                        onChange={handleImageChange}
                        className="w-full"
                        disabled={isExternalURI}
                        ref={imageUploadRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                      />
                      <button
                        type="button"
                        onClick={() => imageUploadRef.current?.click()}
                        className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full
                        disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                        disabled:border-gray-300"
                        disabled={isExternalURI}
                      >
                        <div className='flex items-center justify-center'>
                          <UploadCloud className="mr-2 size-4" />
                          <span>Choose Files</span>
                        </div>
                      </button>
                      {localImages.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-500">Selected Files:</p>
                          <ul className="list-disc list-inside">
                            {localImages.map((file, index) => (
                              <li key={index} className="text-sm flex items-center justify-between">
                                <span>{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeImage(index)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <XCircle className="size-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {imageUrls.length > 0 && (
                        <ImagePreviewList imageUrls={imageUrls} removeImage={removeImage} 
                        isExternalURI={isExternalURI} />
                      )}
                    </>
                  )}
                </div>

                {/* Docs Input */}
                <div className="space-y-2">
                  <h4 className="font-semibold">Documents</h4>
                  <div className="flex">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded mr-2 ${docInputType === 'link'
                        ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' +
                          'disabled:cursor-not-allowed disabled:border-gray-300'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' +
                          'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
                      onClick={() => setDocInputType('link')}
                      disabled={isExternalURI}
                    >
                      <div className='flex items-center justify-center'>
                        <Link className="mr-2 ml-[-2px] w-4" />
                        <span>Link</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded ${docInputType === 'upload'
                        ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' +
                        'disabled:cursor-not-allowed disabled:border-gray-300'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' +
                          'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
                      onClick={() => setDocInputType('upload')}
                      disabled={isExternalURI}
                    >
                      <div className='flex items-center justify-center'>
                        <UploadCloud className="mr-2 ml-[-2px] w-4" />
                        <span>Upload</span>
                      </div>
                    </button>
                  </div>
                  {docInputType === 'link' && (
                    <input
                      type="text"
                      placeholder="Docs URLs (comma-separated)"
                      value={localLab.docs.join(',')}
                      onChange={(e) =>
                        setLocalLab({ ...localLab, docs: e.target.value.split(',') })
                      }
                      className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
                      disabled:cursor-not-allowed disabled:border-gray-300"
                      disabled={isExternalURI}
                      ref={docLinkRef}
                    />
                  )}
                  {errors.docs && <p className="text-red-500 text-sm mt-1">{errors.docs}</p>}
                  {docInputType === 'upload' && (
                    <>
                      <input
                        type="file"
                        multiple
                        onChange={handleDocChange}
                        className="w-full"
                        ref={docUploadRef}
                        style={{ display: 'none' }}
                        accept="application/pdf"
                      />
                      <button
                        type="button"
                        onClick={() => docUploadRef.current?.click()}
                        className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full
                        disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                        disabled:border-gray-300" disabled={isExternalURI}
                      >
                        <div className='flex items-center justify-center'>
                          <UploadCloud className="mr-2 size-4" />
                          <span>Choose Files</span>
                        </div>
                      </button>
                      {localDocs.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-500">Selected Files:</p>
                          <ul className="list-disc list-inside">
                            {localDocs.map((file, index) => (
                              <li key={index} className="text-sm flex items-center justify-between">
                                <span>{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeDoc(index)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <XCircle className="size-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {docUrls.length > 0 && (
                        <DocPreviewList docUrls={docUrls} removeDoc={removeDoc} isExternalURI={isExternalURI} />
                      )}
                    </>
                  )}
                </div>
                <div className="flex justify-between mt-4">
                  <button type="submit" 
                    disabled={activeTab === 'full' && lab?.id && isExternalURI}
                    className="text-white px-4 py-2 rounded bg-[#75a887] hover:bg-[#5c8a68]
                    disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed 
                    disabled:border-gray-300">
                    {lab?.id ? 'Save Changes' : 'Add Lab'}
                  </button>
                  <button type="button" onClick={onClose}
                    className="text-white px-4 py-2 rounded bg-[#a87583] hover:bg-[#8a5c66]">
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {activeTab === 'quick' && (
              <form className="space-y-4 text-gray-600" onSubmit={handleSubmitQuick}>
                <input
                  type="number"
                  placeholder="Price"
                  value={localLab.price}
                  onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isLocalURI}
                  ref={priceRef}
                />
                {errors.price && <p className="text-red-500 text-sm !mt-1">{errors.price}</p>}
                <input
                  type="text"
                  placeholder="Auth URL"
                  value={localLab.auth}
                  onChange={(e) => setLocalLab({ ...localLab, auth: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isLocalURI}
                  ref={categoryRef}
                />
                {errors.auth && activeTab === 'quick' && <p className="text-red-500 text-sm !mt-1">{errors.auth}</p>}
                <input
                  type="text"
                  placeholder="Access URI"
                  value={localLab.accessURI || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isLocalURI}
                  ref={accessURIRef}
                />
                {errors.accessURI && <p className="text-red-500 text-sm !mt-1">{errors.accessURI}</p>}
                <input
                  type="text"
                  placeholder="Access Key"
                  value={localLab.accessKey || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
                  className="w-full p-2 border rounded
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
                  disabled:border-gray-300"
                  disabled={isLocalURI}
                  ref={accessKeyRef}
                />
                {errors.accessKey && <p className="text-red-500 text-sm !mt-1">{errors.accessKey}</p>}
                <input
                  type="text"
                  placeholder="Lab Data URL (JSON)"
                  value={localLab.uri || ''}
                  onChange={handleUriChange}
                  onClick={() => isLocalURI && setHasClickedToEnableUri(true)}
                  onBlur={() => isLocalURI && setHasClickedToEnableUri(false)}
                    readOnly={isLocalURI && !hasClickedToEnableUri}
                    className={`w-full p-2 border rounded ${
                      isLocalURI && !hasClickedToEnableUri
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300'
                        : ''
                  }`}
                  ref={uriRef}
                />
                {errors.uri && !hasClickedToEnableUri && <p className="text-red-500 text-sm !mt-1">{errors.uri}</p>}
                {hasClickedToEnableUri && <ol className="text-red-500 text-sm !mt-1 !list-decimal ml-5">
                  <li>Name changes to the JSON file are not allowed / will be ignored</li>
                  <li>Introducing an URL with a link to an external JSON file will replace the data in Full Data with the information contained in the external JSON file</li>
                  </ol>}
                <div className="flex justify-between mt-4">
                  <button type="submit"
                    className="text-white px-4 py-2 rounded bg-[#75a887] hover:bg-[#5c8a68]">
                    {lab?.id ? 'Save Changes' : 'Add Lab'}
                  </button>
                  <button type="button" onClick={onClose}
                    className="text-white px-4 py-2 rounded bg-[#a87583] hover:bg-[#8a5c66]">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}