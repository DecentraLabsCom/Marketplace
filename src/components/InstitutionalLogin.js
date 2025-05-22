"use client";
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUniversity } from '@fortawesome/free-solid-svg-icons';

export default function InstitutionalLogin({ setIsModalOpen }) {
  const router = useRouter();

  const handleInstitutionalLogin = () => {
    setIsModalOpen(false);
    router.push("/api/auth/sso/saml2/login");
  }

  return (
    <div onClick={handleInstitutionalLogin}
        className="bg-[#715c8c] text-white font-bold rounded-lg px-4 py-2 transition duration-300 
        cursor-pointer ease-in-out hover:bg-[#333f63] hover:text-white  flex items-center 
        justify-center"
        >
        <FontAwesomeIcon icon={faUniversity} className="font-semibold text-4xl mr-3" title="Institutional Account"/>
        Institutional Login
    </div>
  )
}