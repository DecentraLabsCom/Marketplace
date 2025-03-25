import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useReadContract, usePublicClient, useSignMessage } from 'wagmi';
import { contractABI, contractAddress } from '../contracts/bookings';

export default function LabAccess({ userWallet, onBookingStatusChange, auth }) {
  const [loading, setLoading] = useState(false);
  const [hasActiveBooking, setHasActiveBooking] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const router = useRouter();
  const provider = usePublicClient();
  const { signMessageAsync } = useSignMessage();

  const contract = useReadContract({
    address: contractAddress,
    abi: contractABI,
    signerOrProvider: provider,
  });

  useEffect(() => {
    const checkActiveBooking = async () => {
      try {
        //const booking = await contract.hasActiveBooking(userWallet);
        let booking = Math.random() < 0.5;
        setHasActiveBooking(booking);
        onBookingStatusChange(booking); // Notify parent component about booking status
      } catch (error) {
        console.log("Error checking active booking:", error);
      }
    };

    checkActiveBooking();
  }, [userWallet, contract]);

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
        throw new Error("Failed to get the message to sign");
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
          signature: signature
        }),
      });

      if (!responseAuth.ok) {
        throw new Error("Authentication error in the middleware");
      }

      const data = await responseAuth.json();

      if (data.token) {
        // TODO: Fetch the url from /auth2 response? - It would imply decoding the token, though
        data.url = "https://sarlab.dia.uned.es/guacamole/";
        // Redirect to the lab with the JWT token
        router.push(data.url + `?jwt=${data.token}`);
      } else if (data.error) {
        setErrorMessage(data.error);
      } else {
        alert("Unexpected error, please try again.");
      }
    } catch (error) {
      console.error("Error trying to access the lab:", error);
      alert("There was an error verifying your booking. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!hasActiveBooking) {
    return <div />;
  }

  return (
    <div onClick={handleAccess} className="text-center">
      {errorMessage && <div className="text-red-500 mb-3">{errorMessage}</div>} {/* Show error message */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-[#715c8c] bg-opacity-75 
        opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white text-lg 
        font-bold cursor-pointer z-10 hover:bg-[#8a6fa3] hover:bg-opacity-75">
          <div className="absolute inset-0 flex items-center justify-center transform
            transition-transform duration-300 hover:scale-110" style={{ bottom: '-15%' }}>
            <button className="text-white px-4 py-2 rounded mt-3"
              disabled={loading}>
              {loading ? "Verifying..." : "Access"}
            </button>
          </div>
      </div>
    </div>
  );
}