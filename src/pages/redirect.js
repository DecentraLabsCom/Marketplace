import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Redirect() {
  const router = useRouter();
  const { url } = router.query;
  const [message, setMessage] = useState("Redirecting to the lab...");

  useEffect(() => {
    if (url && sessionStorage.token) {
      // Add the JWT to the URL query and send request
      router.push(`${url}?jwt=${sessionStorage.token}`);
      /*fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${sessionStorage.token}`,
        },
        credentials: "include",
        //mode: "cors",
      })
        .then((response) => {
          setTimeout(() => {
            if (response.ok) {
              // Redirect if successfully authenticated
              router.push(url);
            } else {
              setMessage("Authentication failed. Please try again.");
            }
          }, 1000);
        })
        .catch((error) => {
          console.error("Error during authentication:", error);
          setMessage("There was an error while redirecting to the lab. Please try again.");
        });*/
    }
  }, []);

  return (
    <div className="text-center mt-20 p-2">
      <p>{message}</p>
    </div>
  );
}