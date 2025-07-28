/**
 * API endpoint for saving lab data to local storage or cloud
 * Handles POST requests to persist lab information and metadata
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'

/**
 * Saves lab data to file system (local) or cloud storage (Vercel)
 * @param {Request} req - HTTP request with lab data
 * @param {Object} req.body.labData - Lab data object to save
 * @param {string} req.body.labData.name - Lab name
 * @param {string} req.body.labData.description - Lab description
 * @param {string} req.body.labData.category - Lab category
 * @param {Array} req.body.labData.keywords - Lab keywords
 * @param {string} req.body.labData.opens - Opening date
 * @param {string} req.body.labData.closes - Closing date
 * @param {Array} req.body.labData.docs - Document URLs
 * @param {Array} req.body.labData.images - Image URLs
 * @param {Array} req.body.labData.timeSlots - Available time slots
 * @param {string} req.body.labData.uri - Lab URI identifier
 * @returns {Response} JSON response indicating success or error
 */
export async function POST(req) {
  try {
    const { labData } = await req.json();
    const { name, description, category, keywords, opens, closes, docs, images, timeSlots, uri } = 
      labData || {};

    const isVercel = getIsVercel();
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
        const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', blobName);
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
        console.warn(`Failed to fetch existing blob data for ${blobName}:`, e.message);
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
