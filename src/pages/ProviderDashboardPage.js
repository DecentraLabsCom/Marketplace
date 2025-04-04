import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { useLabs } from '../context/LabContext';
import Carrousel from '../components/Carrousel'; // Assuming you have a Carrousel component for displaying images

export default function ProviderDashboard() {
  const { address } = useAccount();
  const { labs, setLabs } = useLabs(); // Assuming `setLabs` is exposed in LabContext
  const [ownedLabs, setOwnedLabs] = useState([]);
  const [editingLabId, setEditingLabId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLab, setNewLab] = useState({
    name: '',
    category: '',
    price: '',
    description: '',
    provider: '',
    auth: '',
    image: [],
    keywords: [],
    docs: [],
  });

  // Filter labs owned by the user
  useEffect(() => {
    if (address && labs) {
      const userLabs = labs.filter((lab) => lab.providerAddress === String(address));
      setOwnedLabs(userLabs);
    }
  }, [address, labs]);

  // Handle unregister/delist a lab
  const handleUnregisterLab = (labId) => {
    const updatedLabs = labs.filter((lab) => lab.id !== labId);
    setLabs(updatedLabs);
  };

  // Handle updating a lab
  const handleUpdateLab = (updatedLab) => {
    const updatedLabs = labs.map((lab) =>
      lab.id === updatedLab.id ? updatedLab : lab
    );
    setLabs(updatedLabs);
    setEditingLabId(null); // Close the expanded view
  };

  // Handle adding a new lab
  const handleAddLab = () => {
    const newLabWithId = { ...newLab, id: Date.now(), providerAddress: address };
    setLabs([...labs, newLabWithId]);
    setNewLab({
      name: '',
      category: '',
      price: '',
      description: '',
      provider: '',
      auth: '',
      image: [],
      keywords: [],
      docs: [],
    });
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Provider Dashboard</h1>

      {/* List Owned Labs */}
      <h2 className="text-xl font-semibold mb-2">Your Labs</h2>
      <ul className="space-y-4">
        {ownedLabs.map((lab) => (
          <li key={lab.id} className="p-4 border rounded shadow">
            <h3 className="text-lg font-bold text-center">{lab.name}</h3>
            <div className="md:w-1/3 flex flex-col items-center justify-center p-4 mr-8">
              <div className="w-full max-h-[200px] flex items-center justify-center">
                {lab.image && lab.image.length > 0 ? (
                  <Carrousel lab={lab} maxHeight={200} />
                ) : (
                  <div className="text-center">No images available</div>
                )}
              </div>
            </div>
            <div className="flex space-x-4 mt-2">
              <button
                onClick={() =>
                  setEditingLabId(editingLabId === lab.id ? null : lab.id)
                }
                className="bg-blue-500 text-white px-4 py-2 rounded"
              >
                {editingLabId === lab.id ? 'Cancel' : 'Edit'}
              </button>
              <button
                onClick={() => handleUnregisterLab(lab.id)}
                className="bg-red-500 text-white px-4 py-2 rounded"
              >
                Unregister
              </button>
            </div>

            {/* Expandable Edit Form */}
            {editingLabId === lab.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUpdateLab(lab);
                }}
                className="mt-4 space-y-4"
              >
                <input
                  type="text"
                  placeholder="Lab Name"
                  value={lab.name}
                  onChange={(e) => (lab.name = e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Category"
                  value={lab.category}
                  onChange={(e) => (lab.category = e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={lab.price}
                  onChange={(e) => (lab.price = e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <textarea
                  placeholder="Description"
                  value={lab.description}
                  onChange={(e) => (lab.description = e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Auth URL"
                  value={lab.auth}
                  onChange={(e) => (lab.auth = e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Provider Name"
                  value={lab.provider}
                  onChange={(e) => (lab.provider = e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Image URLs (comma-separated)"
                  value={lab.image.join(',')}
                  onChange={(e) => (lab.image = e.target.value.split(','))}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Keywords (comma-separated)"
                  value={lab.keywords.join(',')}
                  onChange={(e) => (lab.keywords = e.target.value.split(','))}
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Docs URLs (comma-separated)"
                  value={lab.docs.join(',')}
                  onChange={(e) => (lab.docs = e.target.value.split(','))}
                  className="w-full p-2 border rounded"
                />
                <div className="flex justify-between">
                  <button
                    type="submit"
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLabId(null)}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>

      {/* Add Lab Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full shadow-lg hover:bg-green-600"
      >
        Add New Lab
      </button>

      {/* Add Lab Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-xl font-semibold mb-4">Add New Lab</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddLab();
              }}
              className="space-y-4"
            >
              <input
                type="text"
                placeholder="Lab Name"
                value={newLab.name}
                onChange={(e) => setNewLab({ ...newLab, name: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Category"
                value={newLab.category}
                onChange={(e) => setNewLab({ ...newLab, category: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="number"
                placeholder="Price"
                value={newLab.price}
                onChange={(e) => setNewLab({ ...newLab, price: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <textarea
                placeholder="Description"
                value={newLab.description}
                onChange={(e) => setNewLab({ ...newLab, description: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Auth URL"
                value={newLab.auth}
                onChange={(e) => setNewLab({ ...newLab, auth: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Provider Name"
                value={newLab.provider}
                onChange={(e) => setNewLab({ ...newLab, provider: e.target.value })}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Image URLs (comma-separated)"
                value={newLab.image.join(',')}
                onChange={(e) =>
                  setNewLab({ ...newLab, image: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Keywords (comma-separated)"
                value={newLab.keywords.join(',')}
                onChange={(e) =>
                  setNewLab({ ...newLab, keywords: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                placeholder="Docs URLs (comma-separated)"
                value={newLab.docs.join(',')}
                onChange={(e) =>
                  setNewLab({ ...newLab, docs: e.target.value.split(',') })
                }
                className="w-full p-2 border rounded"
              />
              <div className="flex justify-between">
                <button
                  type="submit"
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                >
                  Add Lab
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}