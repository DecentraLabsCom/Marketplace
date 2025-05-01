"use client";
import { useState, useEffect } from 'react';
import { z } from 'zod';
import { IoPerson } from 'react-icons/io5';
import ReactFlagsSelect from 'react-flags-select';
import { useUser } from '../../context/UserContext';
import AccessControl from '../../components/AccessControl';

const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  wallet: z.string().min(1, 'Wallet address is required').refine(
    (val) => /^0x[a-fA-F0-9]{40}$/.test(val),
    'Wallet address must start with 0x followed by 40 alphanumeric characters'
    ),
  country: z.string().min(2, 'Country is required'),
});

export default function RegisterProviderForm() {
  const { isSSO, user, isProvider } = useUser();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    wallet: '',
    country: '',
  });
  const [errors, setErrors] = useState({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [autoError, setAutoError] = useState(null);
  const [autoRequested, setAutoRequested] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Automatic registration when accessed using SSO
  useEffect(() => {
    if (isSSO && user && autoRequested && !isSuccess && !isProvider) {
    //if (true) {
      const autoRegister = async () => {
        try {
          const providerData = {
            name: user.name,
            email: user.email,
            wallet: user.wallet || '',
            country: user.country || '',
          };
          /*const providerData = {
            name: "UNED",
            email: "contact@dia.uned.es",
            wallet: "0x183F062B6A8C39B9A9e71898741ACf8f25E11561",
            country: "Spain",
          };*/
          const res = await fetch('/api/contract/provider/addProvider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerData),
          });
          if (!res.ok) throw new Error('Failed to register provider');
          setIsSuccess(true);
        } catch (err) {
          setAutoError('Automatic registration failed. Please contact support.');
        }
      };
      autoRegister();
    }
  }, [isSSO, user, autoRequested, isSuccess, isProvider]);


  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isSuccess) {
        if (event.key === 'Escape' || event.key === 'Enter') {
          closeModal();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSuccess]);

  const closeModal = () => {
    setIsSuccess(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = providerSchema.safeParse(formData);

    if (result.success) {
      try {
        const res = await fetch('/api/provider/saveRegistration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error('Failed to save provider');
        setIsSuccess(true);
        setErrors({});
        // Clear form upon success
        setFormData({ name: '', email: '', wallet: '', country: '' });
      } catch (err) {
        setErrors({ general: ['Failed to save provider. Try again later.'] });
      }
    } else {
      // Form data is invalid, update error state
      const formattedErrors = result.error.flatten().fieldErrors;
      setErrors(formattedErrors);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData({ ...formData, [name]: value });
  };

  const setSelected = (code) => {
    setFormData({ ...formData, country: code });
  };

  // Automatic registration when accessed using SSO
  if (isSSO) {
  //if (true) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px]">
        {!autoRequested ? (
          <div className="bg-white rounded-lg shadow-lg p-6 w-96 flex flex-col items-center">
            <h2 className="text-center text-lg font-semibold mb-4 text-black">
              Register as a Provider
            </h2>
            <button onClick={() => setAutoRequested(true)}
              className="flex w-full justify-center rounded-md bg-[#715c8c] px-3 py-1.5 text-sm font-semibold 
              leading-6 text-white shadow-sm hover:bg-[#ad8ed4] focus-visible:outline focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Register
            </button>
          </div>
        ) : isSuccess ? (
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-center text-lg font-bold mb-4 text-black">
              You have been registered as a provider!
            </h2>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-center text-lg font-bold mb-4 text-black">
              Registering you as a provider...
            </h2>
            {autoError && <p className="text-red-500 text-center">{autoError}</p>}
          </div>
        )}
      </div>
    );
  }

  if (!isMounted) return null;

  if (isProvider) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px]">
        <h2 className="text-center text-lg font-bold mb-4 text-white">
          You are already registered as a provider.
        </h2>
      </div>
    );
  }

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <main className="flex justify-center mt-8">
        <section style={{ minWidth: '30%' }}>
          <div className="flex min-h-full shadow-lg flex-1 flex-col justify-center px-6 py-9 lg:px-8 
          bg-white rounded">
            <header className="sm:mx-auto sm:w-full sm:max-w-sm">
              <div className="flex justify-center">
                <IoPerson className="size-[70px] text-[#715c8c] border-2 p-1 border-[#715c8c] 
                rounded mb-2" />
              </div>
              <h2 className="mt-1 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
                Register as a Provider
              </h2>
              <div className="flex justify-center">
                <hr className="mt-2 separator-width-black w-1/2"></hr>
              </div>
            </header>

            <div className="mt-3 sm:mx-auto sm:w-full sm:max-w-sm">
              <form className="space-y-6" onSubmit={handleSubmit}>
                {/* Provider Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                    Provider name
                  </label>
                  <div className="mt-2">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 
                      ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset 
                      focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name[0]}</p>}
                  </div>
                </div>
                {/* Email Address */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
                      Email address
                    </label>
                  </div>
                  <div className="mt-2">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 
                      ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset 
                      focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email[0]}</p>}
                  </div>
                </div>
                {/* Wallet Address */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="wallet" className="block text-sm font-medium leading-6 text-gray-900">
                      Wallet address
                    </label>
                  </div>
                  <div className="mt-2">
                    <input
                      id="wallet"
                      name="wallet"
                      type="text"
                      value={formData.wallet}
                      onChange={handleChange}
                      className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 
                      ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset 
                      focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    {errors.wallet && <p className="text-red-500 text-sm mt-1">{errors.wallet[0]}</p>}
                  </div>
                </div>
                {/* Country */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="country" className="block text-sm font-medium leading-6 text-gray-900">
                      Country
                    </label>
                  </div>
                  <div id="country_dropdown" className="mt-2 text-gray-900">
                    <ReactFlagsSelect
                      selected={formData.country}
                      searchable
                      selectButtonClassName="mt-2 h-[38.5px] sm:text-sm sm:leading-6"
                      onSelect={setSelected}
                      name="country"
                    />
                    {errors.country && <p className="text-red-500 text-sm mt-1">{errors.country[0]}</p>}
                  </div>
                </div>

                <div>
                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSuccess}
                    className="flex w-full justify-center rounded-md bg-[#715c8c] px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-[#ad8ed4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    Register
                  </button>
                  {/* Success modal */}
                  {isSuccess && (
                    <div className="fixed inset-0 bg-black bg-opacity/50 flex justify-center items-center z-50">
                      <div className="bg-white rounded-lg shadow-lg p-6 w-96">
                        <h2 className="text-center text-lg font-semibold mb-4 text-black">
                          You have successfully submitted your interest to register as a lab provider. 
                          Our team will contact you soon to complete the process.
                        </h2>
                        <div className="flex justify-center">
                          <button
                            onClick={closeModal}
                            className="bg-[#715c8c] text-white rounded-md px-4 py-2"
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>
    </AccessControl>
  );
}