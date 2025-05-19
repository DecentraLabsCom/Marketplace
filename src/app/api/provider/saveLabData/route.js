import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(req) {
  try {
    const { labData } = await req.json();
    const { name, description, category, keywords, price, opens, closes, docs, images, timeSlots, uri } = 
      labData || {};

    const isVercel = !!process.env.VERCEL;
    const filePath = path.join(process.cwd(), 'data', uri);
    const blobName = uri;
    let existingData = null;

    if (!isVercel) {
      try {
        // Read existing data if it exists
        const fileContent = await fs.readFile(filePath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          return NextResponse.json(
            { error: 'Failed to read existing lab data.', details: error.message }, 
            { status: 500 }
          );
        }
      }
    } else {
      try {
        const blobUrl = path.join(process.env.VERCEL_BLOB_BASE_URL, 'data', blobName);
        const response = await fetch(blobUrl);
        if (response.ok) {
          try {
            existingData = await response.json();
          } catch {
            existingData = [];
          }
        } else {
          existingData = [];
        }
      } catch (e) {
        // Blob may not exist yet
        existingData = [];
      }
    }

    const newData = {
      name: name || "",
      description: description || "",
      image: images && images.length > 0 ? images[0] : "",
      attributes: [
        { trait_type: "category", value: category || "" },
        { trait_type: "keywords", value: Array.isArray(keywords) ? 
          keywords : (keywords ? keywords.split(',').map(k => k.trim()) : []) },
        { trait_type: "timeSlots", value: Array.isArray(timeSlots) ? 
          timeSlots.map(Number).filter(Boolean) 
          : (timeSlots ? timeSlots.split(',').map(Number).filter(Boolean) : []) },
        { trait_type: "opens", value: opens || "" },
        { trait_type: "closes", value: closes || "" },
        { trait_type: "additionalImages", value: images && images.length > 1 ? images.slice(1) : [] },
        { trait_type: "docs", value: Array.isArray(docs) ? 
          docs : (docs ? docs.split(',').map(d => d.trim()) : []) },
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
      finalData = newData;
    }

    const labJSON = JSON.stringify(finalData, null, 2);
    if (!isVercel) {
      await fs.writeFile(filePath, labJSON, 'utf-8');
    } else {
      await put(`data/${blobName}`, labJSON, 
                { contentType: 'application/json', allowOverwrite: true, access: 'public' });
    }
    return NextResponse.json({ message: 'Lab data saved/updated successfully.' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to save/update lab data.', 
      details: error.message }, { status: 500 
    });
  }
}