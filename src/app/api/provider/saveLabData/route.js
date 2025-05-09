
// import path from 'path';
// import { promises as fs } from 'fs';
// import { NextResponse } from 'next/server';

// export async function POST(req) {
//   try {
//     const { labData, labURI } = await req.json();
//     const { name, description, category, keywords, price, opens, closes, docs, images, timeSlots, uri } = labData || {};

//     const jsonData = {
//       name: name || "",
//       description: description || "",
//       image: images && images.length > 0 ? images[0] : "",
//       attributes: [
//         { trait_type: "category", value: category || "" },
//         { trait_type: "keywords", value: Array.isArray(keywords) ? keywords : (keywords ? keywords.split(',').map(k => k.trim()) : []) },
//         { trait_type: "timeslots", value: Array.isArray(timeSlots) ? timeSlots.map(Number).filter(Boolean) : (timeSlots ? timeSlots.split(',').map(Number).filter(Boolean) : []) },
//         { trait_type: "opens", value: opens || "" },
//         { trait_type: "closes", value: closes || "" },
//         { trait_type: "additionalImages", value: images && images.length > 1 ? images.slice(1) : [] },
//         { trait_type: "docs", value: Array.isArray(docs) ? docs : (docs ? docs.split(',').map(d => d.trim()) : []) },
//       ],
//     };

//     const filePath = path.join(process.cwd(), 'data', labURI);
//     const labJSON = JSON.stringify(jsonData, null, 2);

//     await fs.writeFile(filePath, labJSON, 'utf-8');
//     console.log(`Archivo JSON guardado en: ${filePath}`);
//     return NextResponse.json({ message: 'Lab data saved successfully.' }, { status: 200 });
//   } catch (error) {
//     console.error("Error al escribir el archivo JSON:", error);
//     return NextResponse.json({ error: 'Failed to save lab data.', details: error.message }, { status: 500 });
//   }
// }

//-------------------------

import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { labData, labURI } = await req.json();
    const filePath = path.join(process.cwd(), 'data', labURI);

    let existingData = null;

    try {
      // Read existing json file if it exists
      const fileContent = await fs.readFile(filePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        return NextResponse.json({ error: 'Failed to read existing lab data.', details: error.message }, { status: 500 });
      }
    }

    const { name, description, category, keywords, price, opens, closes, docs, images, timeSlots, uri } = labData || {};

    const newData = {
      name: name || "",
      description: description || "",
      image: images && images.length > 0 ? images[0] : "",
      attributes: [
        { trait_type: "category", value: category || "" },
        { trait_type: "keywords", value: Array.isArray(keywords) ? keywords : (keywords ? keywords.split(',').map(k => k.trim()) : []) },
        { trait_type: "timeslots", value: Array.isArray(timeSlots) ? timeSlots.map(Number).filter(Boolean) : (timeSlots ? timeSlots.split(',').map(Number).filter(Boolean) : []) },
        { trait_type: "opens", value: opens || "" },
        { trait_type: "closes", value: closes || "" },
        { trait_type: "additionalImages", value: images && images.length > 1 ? images.slice(1) : [] },
        { trait_type: "docs", value: Array.isArray(docs) ? docs : (docs ? docs.split(',').map(d => d.trim()) : []) },
      ],
    };

    let finalData;
    if (existingData) {
      // Combine existing data with new updated data
      finalData = {
        ...existingData,
        ...newData,
        attributes: newData.attributes.map(newAttr => {
          const existingAttr = existingData.attributes?.find(attr => attr.trait_type === newAttr.trait_type);
          return existingAttr ? { ...existingAttr, ...newAttr } : newAttr;
        }),
      };
    } else {
      // If json doesn't exist, only use new data
      finalData = newData;
    }

    const labJSON = JSON.stringify(finalData, null, 2);
    await fs.writeFile(filePath, labJSON, 'utf-8');
    return NextResponse.json({ message: 'Lab data saved/updated successfully.' }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to save/update lab data.', details: error.message }, { status: 500 });
  }
}