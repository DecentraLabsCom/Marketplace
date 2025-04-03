import { IoPerson } from "react-icons/io5";
import React, { useState } from "react";
import ReactFlagsSelect from "react-flags-select";
import { submitProvider } from "../actions/providerSchema";
import { useActionState } from 'react'

export default function Register() {
  const [selected, setSelected] = useState("");

  const actionResponse = {
    success: false,
    message: '',
    errors: {
      name: [],
      email: [],
      address: [],
      country: [],
    },
  };

  const initialState = { ...actionResponse,
  success: true,
  message: 'Registration made successfully!' }

  const [state, action, isPending] = useActionState(submitProvider, initialState)

  return (
    <div className="flex justify-center mt-8">
      <div style={{ minWidth: "30%" }}>
        <div className="flex min-h-full shadow-lg flex-1 flex-col justify-center 
        px-6 py-9 lg:px-8 bg-white rounded">
          <div className="sm:mx-auto sm:w-full sm:max-w-sm">
            <div className="flex justify-center">
              <IoPerson className="h-[70px] w-[70px] text-[#715c8c] border-2 p-1 border-[#715c8c] rounded mb-2" />
            </div>
            <h2 className="mt-1 text-center text-2xl font-bold leading-9 
            tracking-tight text-gray-900">
              Register as a Provider
            </h2>
            <div className='flex justify-center'><hr className='mt-2 separator-width-black w-1/2'></hr></div>
          </div>

          <div className="mt-3 sm:mx-auto sm:w-full sm:max-w-sm">
            <form className="space-y-6" action="#" method="POST">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Provider name
                </label>
                <div className="mt-2">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    className="block w-full rounded-md border-0 p-1.5
                  text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 
                  placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 
                    sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Email address
                  </label>
                </div>
                <div className="mt-2">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="block w-full rounded-md border-0 p-1.5 text-gray-900 
                    shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 
                    focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="wallet"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Wallet address
                  </label>
                </div>
                <div className="mt-2">
                  <input
                    id="wallet"
                    name="wallet"
                    type="text"
                    required
                    className="block w-full rounded-md border-0 p-1.5 
                  text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 
                  placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 
                    sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="country"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Country
                  </label>
                </div>
                <div id="country_dropdown" className="mt-2 text-gray-900">
                  <ReactFlagsSelect
                    selected={selected}
                    searchable
                    selectButtonClassName="mt-2 h-[38.5px]
                    sm:text-sm sm:leading-6"
                    onSelect={(code) => setSelected(code)}
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="flex w-full justify-center rounded-md bg-[#715c8c] 
                  px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm 
                  hover:bg-[#ad8ed4] focus-visible:outline focus-visible:outline-2 
                  focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}