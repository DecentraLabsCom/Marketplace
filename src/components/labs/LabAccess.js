"use client";
import { useState } from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { useSignMessage } from 'wagmi'
import devLog from '@/utils/dev/logger'

export default function LabAccess({ id, userWallet, hasActiveBooking, auth }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();

  const handleAccess = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      // Step 1: Ask the backend for a message to be signed
      const responseMessage = await fetch(auth + "message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wallet: userWallet }),
      });

      if (!responseMessage.ok) {
        setErrorMessage("Failed to get the message to sign");
        setTimeout(() => setErrorMessage(null), 1500);
      }

      const { message } = await responseMessage.json();

      // Step 2: Sign the message received from the backend
      const signature = await signMessageAsync({ message });

      // Step 3: Send the wallet address and the signed message to the backend for verification and 
      // to obtain the JWT token (when there is a valid booking)
      const responseAuth = await fetch(auth + "auth2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wallet: userWallet,
          signature: signature,
          labId: id
        }),
      });

      if (!responseAuth.ok) {
        setErrorMessage("An error has ocurred in the authentication service.");
        setTimeout(() => setErrorMessage(null), 1500);
      }

      const data = await responseAuth.json();

      if (data.token && data.labURL) {
        // Redirect to the lab with the JWT token
        router.push(data.labURL + `?jwt=${data.token}`);
      } else if (data.error) {
        setErrorMessage(data.error);
        setTimeout(() => setErrorMessage(null), 1500);
      } else {
        setErrorMessage("Unexpected error, please try again.");
        setTimeout(() => setErrorMessage(null), 1500);
      }
    } catch (error) {
      devLog.error('Lab access error:', error);
      setErrorMessage("There was an error verifying your booking. Try again.");
      setTimeout(() => setErrorMessage(null), 1500);
    } finally {
      setLoading(false);
    }
  };

  if (!hasActiveBooking) {
    return <div />;
  }

  return (
    <div onClick={handleAccess} className="text-center">
      {/* Show the error message */}
      {errorMessage && ( 
        <div className={`fixed z-20 top-1/2 left-1/2 p-4 w-3/4 -translate-x-1/2 
          -translate-y-1/2 bg-[#715c8c] text-white rounded-lg shadow-lg opacity-85`}>
            {errorMessage}
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-[#715c8c]/75 
        opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white text-lg 
        font-bold cursor-pointer z-10">
          <div className="absolute inset-0 flex items-center justify-center transition-transform 
            duration-300 hover:scale-110" style={{ bottom: '-15%' }}>
            <div className={`text-white px-4 py-2 rounded mt-3`}
              disabled={loading}>
              {loading ? "Verifying..." : "Access"}
            </div>
          </div>
      </div>
    </div>
  );
}

LabAccess.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  userWallet: PropTypes.string.isRequired,
  hasActiveBooking: PropTypes.bool.isRequired,
  auth: PropTypes.string
}

LabAccess.defaultProps = {
  auth: ''
}
