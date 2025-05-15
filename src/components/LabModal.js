"use client";
import React, { useEffect, useState } from 'react';

export default function LabModal({ isOpen, onClose, onSubmit, lab, setLab }) {
  const [activeTab, setActiveTab] = useState('full'); // 'full' or 'quick'

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
        <form className="space-y-4 text-gray-600" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {activeTab === 'full' && (
            <>
              <input
                type="text"
                placeholder="Lab Name"
                value={lab.name}
                onChange={(e) => setLab({ ...lab, name: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Category"
                value={lab.category}
                onChange={(e) => setLab({ ...lab, category: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Keywords (comma-separated)"
                value={lab.keywords.join(',')}
                onChange={(e) =>
                  setLab({ ...lab, keywords: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
              <textarea
                placeholder="Description"
                value={lab.description}
                onChange={(e) => setLab({ ...lab, description: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Opens (e.g. 09:00)"
                value={lab.opens || ''}
                onChange={(e) => setLab({ ...lab, opens: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Closes (e.g. 18:00)"
                value={lab.closes || ''}
                onChange={(e) => setLab({ ...lab, closes: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Image URLs (comma-separated)"
                value={lab.images.join(',')}
                onChange={(e) =>
                  setLab({ ...lab, images: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Docs URLs (comma-separated)"
                value={lab.docs.join(',')}
                onChange={(e) =>
                  setLab({ ...lab, docs: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Time Slots (comma-separated)"
                value={Array.isArray(lab.timeSlots) ? lab.timeSlots.join(',') : ''}
                onChange={(e) =>
                  setLab({ ...lab, timeSlots: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
            </>
          )}
          {activeTab === 'quick' && (
            <>
              <input
                type="number"
                placeholder="Price"
                value={lab.price}
                onChange={(e) => setLab({ ...lab, price: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Auth URL"
                value={lab.auth}
                onChange={(e) => setLab({ ...lab, auth: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Access URI"
                value={lab.accessURI || ''}
                onChange={(e) => setLab({ ...lab, accessURI: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Access Key"
                value={lab.accessKey || ''}
                onChange={(e) => setLab({ ...lab, accessKey: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Lab Data URL (JSON)"
                value={lab.externalURI || ''}
                onChange={(e) => setLab({ ...lab, externalURI: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </>
          )}
          <div className="flex justify-between">
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
      </div>
    </div>
  );
}