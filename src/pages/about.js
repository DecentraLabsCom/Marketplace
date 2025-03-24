export default function About() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">About DecentraLabs</h1>
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Nebsyst</h2>
        <p className="text-gray-700 mb-4">
          Nebsyst is a leading provider of innovative solutions in the field of blockchain technology and decentralized systems. Our mission is to empower individuals and organizations by providing them with the tools and knowledge they need to succeed in the rapidly evolving digital landscape.
        </p>
        <p className="text-gray-700 mb-4">
          At Nebsyst, we believe in the transformative power of blockchain technology and its potential to create a more transparent, secure, and efficient world. Our team of experts is dedicated to developing cutting-edge solutions that leverage the power of blockchain to solve real-world problems.
        </p>
        <p className="text-gray-700">
          For more information, visit our website: <a href="https://nebsyst.com" className="text-blue-500 hover:underline">nebsyst.com</a>
        </p>
      </div>
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">DecentraLabs</h2>
        <p className="text-gray-700 mb-4">
          DecentraLabs is a project by Nebsyst focused on creating decentralized remote labs. Our goal is to provide a platform where users can access and utilize remote labs in a secure and decentralized manner. By leveraging blockchain technology, we ensure that the labs are accessible, transparent, and tamper-proof.
        </p>
        <p className="text-gray-700 mb-4">
          DecentraLabs aims to revolutionize the way remote labs are accessed and utilized, making it easier for individuals and organizations to conduct experiments, research, and training without the need for physical presence.
        </p>
        <p className="text-gray-700">
          For more information, visit our project page: <a href="https://decentralabs.nebsyst.com" className="text-blue-500 hover:underline">decentralabs.nebsyst.com</a>
        </p>
      </div>
    </div>
  )
}