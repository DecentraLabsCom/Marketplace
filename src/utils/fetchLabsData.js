import { appendPath } from './pathUtils'

let labs = [];
const subscribers = [];

export const fetchLabsData = async (contract) => {
  /*try {
    // Call the contract function to get the list of registered labs
    const labList = await contract.getAllLabs();

    // Use Promise.all to fetch lab details concurrently
    const labs = await Promise.all(
      labList.map(async (labId) => {
        const labData = await contract.getLab(labId);

        const metadataURI = labData.base.uri;
        const response = await fetch(metadataURI);
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata for lab ${labId}: ${response.statusText}`);
        }
        const metadata = await response.json();

        // Devuelve los datos combinados del contrato y los metadatos
        return {
          id: labData.labId.toNumber(),
          name: metadata.name,
          category: metadata.category,
          keywords: metadata.keywords,
          price: parseFloat(labData.base.price),
          description: metadata.description,
          provider: metadata.provider,
          auth: metadata.auth,
          image: metadata.images,
        };
      })
    );

    // Notify subscriptors with the updated data
    subscribers.forEach((callback) => callback(labs));
  } catch (error) {
    console.error("Error fetching labs data from contract:", error);
  }*/

  // Simulate fetching lab data
  setTimeout(() => {
    labs = [{ id: 1, name: "Four Tanks Lab", category: "Industrial", price: 2.5, 
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin feugiat et eros non congue. Ut nec dapibus dolor, eget rhoncus lacus. Donec tincidunt porta dui, ac scelerisque enim eleifend et. Suspendisse viverra risus eu odio eleifend pellentesque ut non arcu. Phasellus aliquam sapien risus, at tempor ligula feugiat vel. Mauris.",
      provider: "UNED", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_1.jpg",
        appendPath + "/labs/lab1/01.jpg",
        appendPath + "/labs/lab1/02.jpg"
      ], keywords: ["four", "tanks", "lab"] },
    { id: 2, name: "Mobile Robots Lab", category: "Robotics", price: 0.8, 
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin feugiat et eros non congue. Integer tempus et metus sed aliquet. Nulla tincidunt elit sodales, sollicitudin ante.",
      provider: "UHU", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_2.jpg",
        appendPath + "/labs/lab2/01.jpg",
        appendPath + "/labs/lab2/02.jpg",
        appendPath + "/labs/lab2/03.jpg"
      ], keywords: ["mobile", "robots", "lab"] },
    { id: 3, name: "Industrial Instrumentation Lab", category: "Instrumentation", price: 1.0, 
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec efficitur, tortor sit amet sagittis sollicitudin, ante erat congue elit, eu porta ante magna luctus mauris. Suspendisse eget elementum sem. Nam mollis felis dui, quis venenatis quam placerat a. Sed finibus lorem ut magna egestas cursus. Mauris sollicitudin orci nulla, eu vehicula est blandit ut. Nulla accumsan pulvinar leo in malesuada. Nullam eget eros ut enim cursus condimentum non vitae quam.",
      provider: "UNED",auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_3.jpg",
        appendPath + "/labs/lab3/01.jpg",
        appendPath + "/labs/lab3/02.jpeg"
      ], keywords: ["industrial", "instrumentation", "lab"] },
    { id: 4, name: "Three Tanks Lab", category: "Industrial", price: 1.5, 
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      provider: "UHU", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_4.jpg",
        appendPath + "/labs/lab4/01.png",
        appendPath + "/labs/lab4/02.jpg",
        appendPath + "/labs/lab4/03.jpg"
      ], keywords: ["three", "tanks", "lab"] },
    { id: 5, name: "Snell's Law Lab", category: "Optics", provider: "UBC", price: 1.3,
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer tempus et metus sed aliquet. Nulla tincidunt elit sodales, sollicitudin ante.",
      provider: "UBC", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_5.jpg",
        appendPath + "/labs/lab5/01.png",
        appendPath + "/labs/lab5/02.jpg"
      ], keywords: ["snell", "snell's", "law", "lab"] },];
    subscribers.forEach((callback) => callback(labs));
  }, 1500); // Simulate a 1.5-second delay for fetching data
};

export const subscribeToLabs = (callback) => {
  subscribers.push(callback);
  return () => {
    const index = subscribers.indexOf(callback);
    if (index > -1) {
      subscribers.splice(index, 1);
    }
  };
};

export const getLabs = () => labs;