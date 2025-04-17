let labs = [
  { id: 1, name: "Four Tanks Lab", category: "Industrial", price: 2.5, 
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin feugiat et eros non congue. Ut nec dapibus dolor, eget rhoncus lacus. Donec tincidunt porta dui, ac scelerisque enim eleifend et. Suspendisse viverra risus eu odio eleifend pellentesque ut non arcu. Phasellus aliquam sapien risus, at tempor ligula feugiat vel. Mauris.",
    provider: "UNED", providerAddress: "0x183F062B6A8C39B9A9e71898741ACf8f25E11561",
    auth: "https://sarlab.dia.uned.es/auth/", 
    accessURI: "https://sarlab.dia.uned.es/guacamole/", 
    accessKey: "testJWT", 
    timeSlot: [15, 30, 60],
    startDate: "04/18/2025",
    finishDate: "05/25/2025",
    images: [
      "/labs/lab_1.jpg",
      "/labs/lab1/01.jpg",
      "/labs/lab1/02.jpg"
    ], 
    keywords: ["four", "tanks", "lab"],
    docs: [
      "https://www.example.com/theory.pdf",
      "https://pdfobject.com/pdf/sample.pdf",
    ] },
  { id: 2, name: "Mobile Robots Lab", category: "Robotics", price: 0.8, 
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin feugiat et eros non congue. Integer tempus et metus sed aliquet. Nulla tincidunt elit sodales, sollicitudin ante.",
    provider: "UHU", providerAddress: "0x183F062B6A8C39B9A9e71898741ACf8f25E11561",
    auth: "https://sarlab.dia.uned.es/auth/", 
    accessURI: "https://sarlab.dia.uned.es/guacamole/", 
    accessKey: "testJWT",
    timeSlot: [30, 120],
    startDate: "02/18/2025",
    finishDate: "12/25/2025",
    images: [
      "/labs/lab_2.jpg",
      "/labs/lab2/01.jpg",
      "/labs/lab2/02.jpg",
      "/labs/lab2/03.jpg"
    ], 
    keywords: ["mobile", "robots", "lab"],
    docs: [
      "https://www.example.com/manual.pdf",
    ] },
  { id: 3, name: "Industrial Instrumentation Lab", category: "Instrumentation", price: 1.0, 
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec efficitur, tortor sit amet sagittis sollicitudin, ante erat congue elit, eu porta ante magna luctus mauris. Suspendisse eget elementum sem. Nam mollis felis dui, quis venenatis quam placerat a. Sed finibus lorem ut magna egestas cursus. Mauris sollicitudin orci nulla, eu vehicula est blandit ut. Nulla accumsan pulvinar leo in malesuada. Nullam eget eros ut enim cursus condimentum non vitae quam.",
    provider: "UNED", providerAddress: "0x183F062B6A8C39B9A9e71898741ACf8f25E11561",
    auth: "https://sarlab.dia.uned.es/auth/", 
    accessURI: "https://sarlab.dia.uned.es/guacamole/", 
    accessKey: "testJWT",
    timeSlot: [15, 30, 60],
    startDate: "04/15/2025",
    finishDate: "11/30/2025",
    images: [
      "/labs/lab_3.jpg",
      "/labs/lab3/01.jpg",
      "/labs/lab3/02.jpeg"
    ], 
    keywords: ["industrial", "instrumentation", "lab"],
    docs: [
    ] },
  { id: 4, name: "Three Tanks Lab", category: "Industrial", price: 1.5, 
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    provider: "UHU", providerAddress: "0x183F062B6A8C39B9A9e71898741ACf8f25E11561",
    auth: "https://sarlab.dia.uned.es/auth/", 
    accessURI: "https://sarlab.dia.uned.es/guacamole/", 
    accessKey: "testJWT",
    timeSlot: [15, 30, 60],
    startDate: "04/15/2025",
    finishDate: "11/30/2025",
    images: [
      "/labs/lab_4.jpg",
      "/labs/lab4/01.png",
      "/labs/lab4/02.jpg",
      "/labs/lab4/03.jpg"
    ], 
    keywords: ["three", "tanks", "lab"],
    docs: [
    ] },
  { id: 5, name: "Snell's Law Lab", category: "Optics", provider: "UBC", price: 1.3,
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer tempus et metus sed aliquet. Nulla tincidunt elit sodales, sollicitudin ante.",
    provider: "UBC", providerAddress: "0x183F062B6A8C39B9A9e71898741ACf8f25E11561",
    auth: "https://sarlab.dia.uned.es/auth/", 
    accessURI: "https://sarlab.dia.uned.es/guacamole/", 
    accessKey: "testJWT",
    timeSlot: [15, 30, 60],
    startDate: "06/15/2025",
    finishDate: "08/01/2025",
    images: [
      "/labs/lab_5.jpg",
      "/labs/lab5/01.png",
      "/labs/lab5/02.jpg"
    ], 
    keywords: ["snell", "snell's", "law", "lab"] ,
    docs: [
      "https://www.example.com/manual.pdf",
    ] }
];

export const simLabsData = () => {
  return labs;
};