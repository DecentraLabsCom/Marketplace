"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { UploadCloud, Link, XCircle } from 'lucide-react';

export default function LabModal({ isOpen, onClose, onSubmit, lab, maxId }) {
  const [activeTab, setActiveTab] = useState('full');
  const [imageInputType, setImageInputType] = useState('link');
  const [docInputType, setDocInputType] = useState('link');
  const [localImages, setLocalImages] = useState([]);
  const [localDocs, setLocalDocs] = useState([]);
  const [imageUrls, setImageUrls] = useState([]);
  const [docUrls, setDocUrls] = useState([]);
  const [localLab, setLocalLab] = useState({ ...lab });

  const imageUploadRef = useRef(null);
  const docUploadRef = useRef(null);
  const currentLabId = lab.id || maxId + 1;

  const uploadFile = async (file, destinationFolder, labId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('destinationFolder', destinationFolder);
    formData.append('labId', labId);

    try {
      const response = await fetch('/api/provider/uploadFile', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error al subir el archivo: ${response.statusText}`);
      }

      const data = await response.json();
      let filePath = data.filePath;
      return filePath;
    } catch (error) {
      console.error('Error al subir el archivo:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setLocalImages([]);
      setLocalDocs([]);
      setImageUrls([]);
      setDocUrls([]);
      return;
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load existing images and docs for preview when the modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalLab(lab ? { ...lab } : {});
    }
    if (isOpen && lab?.images?.length > 0) {
      const initialImageUrls = lab.images.map(imageUrl => {
        if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
          return `${currentLabId}/${imageUrl}`;
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
              console.error("No valid lab ID available for image upload. Lab:", lab, "Pending ID:", pendingLabId);
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
                      console.log('currentLabId:', currentLabId);
                      console.log('lab entero:', lab);
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
          console.error("Error al subir documentos", error);
        }
      } else { //If all files are PDFs
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
          console.error("Error al subir documentos", error);
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

          if (!currentLabId) {
            console.error("No valid lab ID available for image upload. Lab:", lab, "Pending ID:", pendingLabId);
            return;
          }
          // Construct filePath relative to /public
          const filePathToDelete = imageToDelete.startsWith('/') ? imageToDelete.substring(1) : imageToDelete;
          const formDatatoDelete = new FormData();
          formDatatoDelete.append('filePath', filePathToDelete);
          formDatatoDelete.append('labId', currentLabId);

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

    setLocalLab(prevLab => {
      const docToDelete = prevLab.docs[index]; // Get the path to delete
      const updatedDocs = prevLab.docs.filter((_, i) => i !== index);

      // Delete the file from the server
      if (docToDelete) {
        if (!currentLabId) {
          console.error("No valid lab ID available for image upload. Lab:", lab, "Pending ID:", pendingLabId);
          return;
        }
        // Construct filePath relative to /public
        const filePathToDelete = docToDelete.startsWith('/') ? docToDelete.substring(1) : docToDelete;
        const formDatatoDelete = new FormData();
        formDatatoDelete.append('filePath', filePathToDelete);
        formDatatoDelete.append('labId', currentLabId);
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
  };

  const handleSubmitFull = (e) => {
    e.preventDefault();
    onSubmit(localLab);
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(localLab);
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
          <div className="mt-4">
            {activeTab === 'full' && (
              <form className="space-y-4 text-gray-600" onSubmit={handleSubmitFull}>
                <input
                  type="text"
                  placeholder="Lab Name"
                  value={localLab.name}
                  onChange={(e) => setLocalLab({ ...localLab, name: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Category"
                  value={localLab.category}
                  onChange={(e) => setLocalLab({ ...localLab, category: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Keywords (comma-separated)"
                  value={localLab.keywords.join(',')}
                  onChange={(e) =>
                    setLocalLab({ ...localLab, keywords: e.target.value.split(',') })
                  }
                  className="w-full p-2 border rounded"
                />
                <textarea
                  placeholder="Description"
                  value={localLab.description}
                  onChange={(e) => setLocalLab({ ...localLab, description: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={localLab.price}
                  onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Auth URL"
                  value={localLab.auth}
                  onChange={(e) => setLocalLab({ ...localLab, auth: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Access URI"
                  value={localLab.accessURI || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Access Key"
                  value={localLab.accessKey || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Time Slots (comma-separated)"
                  value={Array.isArray(localLab.timeSlots) ? localLab.timeSlots.join(',') : ''}
                  onChange={(e) =>
                    setLocalLab({ ...localLab, timeSlots: e.target.value.split(',') })
                  }
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Opens (e.g. 09:00)"
                  value={localLab.opens || ''}
                  onChange={(e) => setLocalLab({ ...localLab, opens: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Closes (e.g. 18:00)"
                  value={localLab.closes || ''}
                  onChange={(e) => setLocalLab({ ...localLab, closes: e.target.value })}
                  className="w-full p-2 border rounded"
                />

                {/* Image Input */}
                <div className="space-y-2">
                  <h4 className="font-semibold">Images</h4>
                  <div className="flex">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded mr-2 ${imageInputType === 'link'
                        ? 'bg-[#7875a8] text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      onClick={() => setImageInputType('link')}
                    >
                      <div className='flex items-center justify-center'>
                        <Link className="mr-2 ml-[-2px] w-4" />
                        <span>Link</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded ${imageInputType === 'upload'
                        ? 'bg-[#7875a8] text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      onClick={() => setImageInputType('upload')}
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
                      className="w-full p-2 border rounded"
                    />
                  )}
                  {imageInputType === 'upload' && (
                    <>
                      <input
                        type="file"
                        multiple
                        onChange={handleImageChange}
                        className="w-full"
                        ref={imageUploadRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                      />
                      <button
                        type="button"
                        onClick={() => imageUploadRef.current?.click()}
                        className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full"
                      >
                        <div className='flex items-center justify-center'>
                          <UploadCloud className="mr-2 h-4 w-4" />
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
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {imageUrls.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {imageUrls.map((url, index) => (
                            <div key={index} className="relative group">
                              <img src={url} alt={`Preview ${index}`} className="h-16 w-full object-cover rounded" />
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
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
                        ? 'bg-[#7875a8] text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      onClick={() => setDocInputType('link')}
                    >
                      <div className='flex items-center justify-center'>
                        <Link className="mr-2 ml-[-2px] w-4" />
                        <span>Link</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded ${docInputType === 'upload'
                        ? 'bg-[#7875a8] text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      onClick={() => setDocInputType('upload')}
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
                      className="w-full p-2 border rounded"
                    />
                  )}
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
                        className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full"
                      >
                        <div className='flex items-center justify-center'>
                          <UploadCloud className="mr-2 h-4 w-4" />
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
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {docUrls.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-500">Uploaded Documents:</p>
                          <ul className="list-disc list-inside">
                            {docUrls.map((url, index) => {
                              const filename = url.split('/').pop();
                              return (
                                <li key={index} className="text-sm flex items-center justify-between">
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                    {filename}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => removeDoc(index)}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
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
            {activeTab === 'quick' && (
              <form className="space-y-4 text-gray-600" onSubmit={handleSubmit}>
                <input
                  type="number"
                  placeholder="Price"
                  value={localLab.price}
                  onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Auth URL"
                  value={localLab.auth}
                  onChange={(e) => setLocalLab({ ...localLab, auth: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Access URI"
                  value={localLab.accessURI || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Access Key"
                  value={localLab.accessKey || ''}
                  onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Lab Data URL (JSON)"
                  value={localLab.uri || ''}
                  onChange={(e) => setLocalLab({ ...localLab, uri: e.target.value })}
                  className="w-full p-2 border rounded"
                />
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