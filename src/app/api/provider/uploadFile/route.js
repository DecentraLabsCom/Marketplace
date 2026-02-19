/**
 * API endpoint for uploading files (images/documents) for lab providers
 * Handles POST requests to upload and store files locally or in cloud storage
 * 
 * SECURITY: Requires authentication and lab ownership verification
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import sharp from 'sharp'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'
import { 
  requireAuth, 
  requireLabOwner, 
  handleGuardError,
  HttpError 
} from '@/utils/auth/guards'

const IMAGE_OPTIMIZATION = {
  minBytesToOptimize: 250 * 1024, // Keep small files untouched to preserve fidelity.
  maxWidth: 2200,
  maxHeight: 2200,
  jpegQuality: 88,
  webpQuality: 88,
  pngCompressionLevel: 9,
}

const OPTIMIZABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const shouldOptimizeImageUpload = ({ destinationFolder, contentType, fileSize }) => {
  return (
    destinationFolder === 'images' &&
    OPTIMIZABLE_IMAGE_TYPES.has(contentType) &&
    fileSize >= IMAGE_OPTIMIZATION.minBytesToOptimize
  )
}

const optimizeImageForUpload = async (buffer, contentType) => {
  const image = sharp(buffer, { failOn: 'none' }).rotate()
  const metadata = await image.metadata()

  let pipeline = image.resize(IMAGE_OPTIMIZATION.maxWidth, IMAGE_OPTIMIZATION.maxHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (contentType === 'image/jpeg') {
    pipeline = pipeline.jpeg({
      quality: IMAGE_OPTIMIZATION.jpegQuality,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: '4:4:4',
    })
  } else if (contentType === 'image/webp') {
    pipeline = pipeline.webp({
      quality: IMAGE_OPTIMIZATION.webpQuality,
      effort: 5,
    })
  } else if (contentType === 'image/png') {
    pipeline = pipeline.png({
      compressionLevel: IMAGE_OPTIMIZATION.pngCompressionLevel,
      effort: 8,
      adaptiveFiltering: true,
      palette: false,
    })
  }

  const optimizedBuffer = await pipeline.toBuffer()
  const useOptimized = optimizedBuffer.length < buffer.length

  return {
    buffer: useOptimized ? optimizedBuffer : buffer,
    useOptimized,
    originalBytes: buffer.length,
    outputBytes: useOptimized ? optimizedBuffer.length : buffer.length,
    dimensions: {
      width: metadata.width || null,
      height: metadata.height || null,
    },
  }
}

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
    // ===== AUTHENTICATION & AUTHORIZATION =====
    // Require valid session (works for both SSO and wallet users)
    const session = await requireAuth();
    
    // Parse form data to get file and labId
    const formData = await req.formData();
    const file = formData.get('file');
    const destinationFolder = formData.get('destinationFolder');
    const labId = formData.get('labId');

    // Validate labId and authorize ownership (skip for temp folder uploads during lab creation)
    if (labId && labId !== 'temp') {
      await requireLabOwner(session, labId);
    } else if (!labId) {
      // If no labId provided, this is an error - we need to know where to save
      return NextResponse.json(
        { 
          error: 'Missing required field: labId',
          code: 'MISSING_LAB_ID'
        }, 
        { status: 400 }
      );
    }
    // Note: labId === 'temp' is allowed without ownership check (for new lab creation flow)

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
    const relativePath = `/${labId || 'temp'}/${destinationFolder}/${sanitizedFileName}`;

    try {
      const buffer = await file.arrayBuffer();
      const sourceBuffer = Buffer.from(buffer);
      let uploadBuffer = sourceBuffer;
      let optimization = {
        applied: false,
        originalBytes: sourceBuffer.length,
        outputBytes: sourceBuffer.length,
        dimensions: null,
      };

      if (shouldOptimizeImageUpload({
        destinationFolder,
        contentType: detectedContentType,
        fileSize: sourceBuffer.length,
      })) {
        try {
          const result = await optimizeImageForUpload(sourceBuffer, detectedContentType);
          uploadBuffer = result.buffer;
          optimization = {
            applied: result.useOptimized,
            originalBytes: result.originalBytes,
            outputBytes: result.outputBytes,
            dimensions: result.dimensions,
          };
        } catch (optimizationError) {
          devLog.warn('Image optimization failed; uploading original file', {
            fileName: sanitizedFileName,
            error: optimizationError?.message,
          });
        }
      }

      let filePath; // This will be the URL returned to the client
      
      if (!isVercel) {
        // Local development: save to public folder and return relative path
        await fs.mkdir(path.dirname(localFilePath), { recursive: true });
        await fs.writeFile(localFilePath, uploadBuffer);
        filePath = relativePath; // For local, use relative path
      } else {
        // Production: upload to Vercel Blob and return full blob URL
        const blobPath = `data${relativePath}`;
        const blob = await put(blobPath, uploadBuffer, 
                  { contentType: detectedContentType, allowOverwrite: true, access: 'public' });
        filePath = blob.url; // ✅ Return the full blob URL for production
        devLog.info(`📤 File uploaded to blob: ${blob.url}`);
      }

      return NextResponse.json(
        { 
          message: 'File uploaded successfully',
          filePath: filePath, // ✅ Now returns full blob URL in production, relative path locally
          originalName: file.name,
          sanitizedName: sanitizedFileName,
          size: uploadBuffer.length,
          originalSize: file.size,
          contentType: detectedContentType,
          timestamp: timestamp,
          uploadedTo: isVercel ? 'blob' : 'local',
          optimization
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
    // Handle authentication/authorization errors
    if (error instanceof HttpError) {
      return handleGuardError(error);
    }
    
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
