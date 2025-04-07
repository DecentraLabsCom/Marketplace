import React from 'react';

export default function LabModal({ isOpen, onClose, onSubmit, lab, setLab }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-[30rem]">
        <h2 className="text-xl font-semibold mb-4 text-black">
          {lab?.id ? 'Edit Lab' : 'Add New Lab'}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4 text-gray-600"
        >
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
            type="number"
            placeholder="Price"
            value={lab.price}
            onChange={(e) => setLab({ ...lab, price: e.target.value })}
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
            placeholder="Auth URL"
            value={lab.auth}
            onChange={(e) => setLab({ ...lab, auth: e.target.value })}
            className="w-full p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Provider Name"
            value={lab.provider}
            onChange={(e) => setLab({ ...lab, provider: e.target.value })}
            className="w-full p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Image URLs (comma-separated)"
            value={lab.image.join(',')}
            onChange={(e) =>
              setLab({ ...lab, image: e.target.value.split(',') })
            }
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
          <input
            type="text"
            placeholder="Docs URLs (comma-separated)"
            value={lab.docs.join(',')}
            onChange={(e) =>
              setLab({ ...lab, docs: e.target.value.split(',') })
            }
            className="w-full p-2 border rounded"
          />
          <div className="flex justify-between">
            <button
              type="submit"
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              {lab?.id ? 'Save Changes' : 'Add Lab'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}