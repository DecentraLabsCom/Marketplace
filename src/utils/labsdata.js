import { appendPath } from '../utils/pathUtils'

const labs = ([{ id: 1, name: "Four Tanks Lab", category: "Industrial", price: 2.5, 
      description: "", provider: "UNED", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_1.jpg",
        appendPath + "/labs/lab1/01.jpg",
        appendPath + "/labs/lab1/02.jpg"
      ] },
    { id: 2, name: "Mobile Robots Lab", category: "Robotics", price: 0.8, 
      description: "", provider: "UHU", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_2.jpg",
        appendPath + "/labs/lab2/01.jpg",
        appendPath + "/labs/lab2/02.jpg",
        appendPath + "/labs/lab2/03.jpg"
      ] },
    { id: 3, name: "Industrial Instrumentation Lab", category: "Instrumentation", price: 1.0, 
      description: "", provider: "UNED",auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_3.jpg",
        appendPath + "/labs/lab3/01.jpg",
        appendPath + "/labs/lab3/02.jpeg"
      ] },
    { id: 4, name: "Three Tanks Lab", category: "Industrial", price: 1.5, 
      description: "", provider: "UHU", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_4.jpg",
        appendPath + "/labs/lab4/01.png",
        appendPath + "/labs/lab4/02.jpg",
        appendPath + "/labs/lab4/03.jpg"
      ] },
    { id: 5, name: "Snell's Law Lab", category: "Optics", provider: "UBC", price: 1.3,
      description: "",  provider: "UBC", auth: "https://sarlab.dia.uned.es/auth/", 
      image: [
        appendPath + "/labs/lab_5.jpg",
        appendPath + "/labs/lab5/01.png",
        appendPath + "/labs/lab5/02.jpg"
      ] },]);

export { labs };
