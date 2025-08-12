/**
 * API endpoint for uploading files (images/documents) for lab providers
 * Handles POST requests to upload and store files locally or in cloud storage
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'

/**
 * Uploads files for lab providers with support for local and cloud storage
 * @param {Request} req - HTTP request with multipart form data
 * @param {File} req.formData.file - File to upload
 * @param {string} req.formData.destinationFolder - Target folder for file storage
 * @param {string} req.formData.labId - Associated lab identifier
 * @returns {Response} JSON response with file URL or error
 */
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const destinationFolder = formData.get('destinationFolder');
    const labId = formData.get('labId');

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { 
          error: 'Missing required field: file',
          code: 'MISSING_FILE'
        }, 
        { status: 400 }
      );
    }

    if (!destinationFolder) {
      return NextResponse.json(
        { 
          error: 'Missing required field: destinationFolder',
          code: 'MISSING_DESTINATION_FOLDER'
        }, 
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { 
          error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
          code: 'FILE_TOO_LARGE',
          maxSize: maxSize,
          fileSize: file.size
        }, 
        { status: 413 } // Payload Too Large
      );
    }

    // Validate file name
    if (!file.name || file.name.trim() === '') {
      return NextResponse.json(
        { 
          error: 'File must have a valid name',
          code: 'INVALID_FILE_NAME'
        }, 
        { status: 400 }
      );
    }

    // Sanitize file name (remove potentially dangerous characters)
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    const isVercel = getIsVercel();
    const timestamp = new Date().toISOString();

    // Dynamic Content-Type Detection
    let detectedContentType = file.type;

    // Fallback: If file.type is not available or is generic, try to infer from the file extension
    if (!detectedContentType || detectedContentType === 'application/octet-stream') {
        const ext = sanitizedFileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'pdf': detectedContentType = 'application/pdf'; break;
            case 'jpg':
            case 'jpeg': detectedContentType = 'image/jpeg'; break;
            case 'png': detectedContentType = 'image/png'; break;
            case 'gif': detectedContentType = 'image/gif'; break;
            case 'webp': detectedContentType = 'image/webp'; break;
            case 'svg': detectedContentType = 'image/svg+xml'; break;
            default: detectedContentType = 'application/octet-stream';
        }
    }

    // Validate file type based on destination folder
    const allowedTypes = {
      'images': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      'docs': ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    };

    if (allowedTypes[destinationFolder] && !allowedTypes[destinationFolder].includes(detectedContentType)) {
      return NextResponse.json(
        { 
          error: `Invalid file type for ${destinationFolder}. Allowed types: ${allowedTypes[destinationFolder].join(', ')}`,
          code: 'INVALID_FILE_TYPE',
          detectedType: detectedContentType,
          allowedTypes: allowedTypes[destinationFolder]
        }, 
        { status: 415 } // Unsupported Media Type
      );
    }

    const localFilePath = path.join(`./public/${labId || 'temp'}`, destinationFolder, sanitizedFileName);
    const filePath = `/${labId || 'temp'}/${destinationFolder}/${sanitizedFileName}`;

    try {
      const buffer = await file.arrayBuffer();
      
      if (!isVercel) {
        await fs.mkdir(path.dirname(localFilePath), { recursive: true });
        await fs.writeFile(localFilePath, Buffer.from(buffer));
      } else {
        await put(`data${filePath}`, Buffer.from(buffer), 
                  { contentType: detectedContentType, allowOverwrite: true, access: 'public' });
      }

      return NextResponse.json(
        { 
          message: 'File uploaded successfully',
          filePath: filePath,
          originalName: file.name,
          sanitizedName: sanitizedFileName,
          size: file.size,
          contentType: detectedContentType,
          timestamp: timestamp,
          uploadedTo: isVercel ? 'blob' : 'local'
        }, 
        { status: 201 } // Created
      );

    } catch (uploadError) {
      console.error('Error during file upload:', uploadError);
      return NextResponse.json(
        {
          error: 'Failed to upload file',
          code: 'UPLOAD_ERROR',
          details: process.env.NODE_ENV === 'development' ? uploadError.message : undefined
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in uploadFile endpoint:', error);
    
    // Handle form data parsing errors
    if (error.message?.includes('FormData')) {
      return NextResponse.json(
        {
          error: 'Invalid form data',
          code: 'INVALID_FORM_DATA',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
