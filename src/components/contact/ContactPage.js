export default function Contact() {
  function sendEmail(event) {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const message = document.getElementById("message").value;

    const subject = encodeURIComponent("New message from DecentraLabs form");
    const body = encodeURIComponent(`From: ${email}\n\n${message}`);

    window.location.href =
        `mailto:contact@nebsyst.com?subject=${subject}&body=${body}`;
  }

  return (
    <div className="container mx-auto p-4 ">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">Contact Information</h1>
      </div>
      <div className="bg-white shadow-md rounded-lg p-6 sm:mx-auto sm:max-w-3xl">
        <p className="text-gray-700 mb-4">
          If you want to know more about how to integrate your remote labs with us,
          you can contact us and we will be glad to provide you with our help:
        </p>
        <form className="flex flex-col gap-4" onSubmit={sendEmail}>
        <input type="email" id="email" name="email" placeholder="Your Email" required
          className="p-2 border-2 border-brand focus:border-[#333f63] rounded 
          outline-none transition text-black" />
        <textarea id="message" name="message" placeholder="Your Message" required
          className="p-2 border-2 border-brand focus:border-[#333f63] rounded 
          outline-none transition text-black min-h-[120px]" />
        <button type="submit" 
          className="bg-brand hover:bg-[#333f63] text-white font-bold rounded-lg 
          px-4 py-2 transition duration-300 ease-in-out shadow-md">
          Send Message
        </button>
      </form>
      <p className="text-[#333f63] font-semibold text-center mt-4">contact@nebsyst.com</p>
      </div>
    </div>
  )
}