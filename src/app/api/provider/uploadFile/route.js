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
  requireProviderRole,
  handleGuardError,
  HttpError 
} from '@/utils/auth/guards'
import {
  buildStoredFilename,
  detectUploadContentType,
  getContentTypesForFolder,
  getSessionUploadNamespace,
  isContentTypeAllowed,
  MAX_UPLOAD_BYTES,
  resolveManagedLocalPath,
  validateDestinationFolder,
  validateLabId,
} from '@/utils/storage/fileSecurity'
import { enforceTemporaryUploadQuota, TemporaryUploadLimitError } from '@/utils/storage/temporaryUploads'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'provider-upload-file', windowMs: 60_000, maxRequests: 20 })

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
    // Require a valid authenticated session
    const session = await requireAuth();
    const rateLimitResponse = createRateLimitResponse(await checkRate(req, session))
    if (rateLimitResponse) return rateLimitResponse
    
    // Parse form data to get file and labId
    const formData = await req.formData();
    const file = formData.get('file');
    const destinationFolder = String(formData.get('destinationFolder') || '').trim();
    const labId = String(formData.get('labId') || '').trim();
    const isTemporaryUpload = labId === 'temp';
    let temporaryNamespace = null;

    // Temporary uploads are still provider operations and are isolated to the
    // current authenticated session. They never use a shared /temp namespace.
    if (isTemporaryUpload) {
      requireProviderRole(session);
      temporaryNamespace = getSessionUploadNamespace(session);
    } else if (labId) {
      try {
        validateLabId(labId);
      } catch (validationError) {
        return NextResponse.json(
          { error: validationError.message, code: 'INVALID_LAB_ID' },
          { status: 400 },
        );
      }
      await requireLabOwner(session, labId);
    } else {
      // If no labId provided, this is an error - we need to know where to save
      return NextResponse.json(
        { 
          error: 'Missing required field: labId',
          code: 'MISSING_LAB_ID'
        }, 
        { status: 400 }
      );
    }
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

    let normalizedDestinationFolder;
    try {
      normalizedDestinationFolder = validateDestinationFolder(destinationFolder);
    } catch (validationError) {
      return NextResponse.json(
        { error: validationError.message, code: 'INVALID_DESTINATION_FOLDER' },
        { status: 400 },
      );
    }

    // Validate the declared size before reading, then validate the actual byte
    // length below. The client-provided MIME type is never trusted.
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { 
          error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
          code: 'FILE_TOO_LARGE',
          maxSize: MAX_UPLOAD_BYTES,
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
    const isVercel = getIsVercel();
    const timestamp = new Date().toISOString();

    try {
      const buffer = await file.arrayBuffer();
      const sourceBuffer = Buffer.from(buffer);
      if (sourceBuffer.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: 'File too large', code: 'FILE_TOO_LARGE', maxSize: MAX_UPLOAD_BYTES },
          { status: 413 },
        );
      }
      const detectedContentType = detectUploadContentType(sourceBuffer, String(file.type || ''));
      if (!isContentTypeAllowed(normalizedDestinationFolder, detectedContentType)) {
        return NextResponse.json(
          {
            error: `Invalid file type for ${normalizedDestinationFolder}`,
            code: 'INVALID_FILE_TYPE',
            detectedType: detectedContentType,
            allowedTypes: getContentTypesForFolder(normalizedDestinationFolder),
          },
          { status: 415 },
        );
      }
      if (isTemporaryUpload) {
        await enforceTemporaryUploadQuota({
          publicRoot: path.join(process.cwd(), 'public'),
          namespace: temporaryNamespace,
          isVercel,
          incomingBytes: sourceBuffer.length,
        });
      }
      const storedFileName = buildStoredFilename(file.name, detectedContentType);
      const relativePath = isTemporaryUpload
        ? `temp/${temporaryNamespace}/${normalizedDestinationFolder}/${storedFileName}`
        : `${labId}/${normalizedDestinationFolder}/${storedFileName}`;
      const localFilePath = resolveManagedLocalPath(path.join(process.cwd(), 'public'), relativePath);
      let uploadBuffer = sourceBuffer;
      let optimization = {
        applied: false,
        originalBytes: sourceBuffer.length,
        outputBytes: sourceBuffer.length,
        dimensions: null,
      };

      if (shouldOptimizeImageUpload({
        destinationFolder: normalizedDestinationFolder,
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
            fileName: storedFileName,
            error: sanitizeErrorForLog(optimizationError),
          });
        }
      }

      let filePath; // This will be the URL returned to the client
      
      if (!isVercel) {
        // Local development: save to public folder and return relative path
        await fs.mkdir(path.dirname(localFilePath), { recursive: true });
        await fs.writeFile(localFilePath, uploadBuffer, { flag: 'wx' });
        filePath = `/${relativePath}`; // For local, use relative path
      } else {
        // Production: upload to Vercel Blob and return full blob URL
        const blobPath = `data/${relativePath}`;
        const blob = await put(blobPath, uploadBuffer,
                  { contentType: detectedContentType, allowOverwrite: false, access: 'public' });
        filePath = blob.url; // ✅ Return the full blob URL for production
        devLog.info(`📤 File uploaded to blob: ${blob.url}`);
      }

      return NextResponse.json(
        { 
          message: 'File uploaded successfully',
          filePath: filePath, // ✅ Now returns full blob URL in production, relative path locally
          originalName: file.name,
          sanitizedName: storedFileName,
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
      if (uploadError instanceof TemporaryUploadLimitError) {
        return NextResponse.json(
          { error: uploadError.message, code: uploadError.code },
          { status: 413 },
        );
      }
      if (uploadError.message === 'SVG uploads are not allowed' || uploadError.message === 'File content type could not be verified') {
        return NextResponse.json(
          { error: uploadError.message, code: 'INVALID_FILE_CONTENT' },
          { status: 415 },
        );
      }
      return publicErrorResponse({
        status: 500,
        code: 'UPLOAD_ERROR',
        message: 'The file could not be uploaded.',
        error: uploadError,
        context: 'provider-upload-file',
      });
    }

  } catch (error) {
    // Handle authentication/authorization errors
    if (error instanceof HttpError) {
      return handleGuardError(error, req);
    }
    
    // Handle form data parsing errors
    if (error.message?.includes('FormData')) {
      return publicErrorResponse({
        status: 400,
        code: 'INVALID_FORM_DATA',
        message: 'The uploaded form data is invalid.',
        error,
        context: 'provider-upload-file-form-data',
      });
    }
    
    return publicErrorResponse({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'The upload request could not be completed.',
      error,
      context: 'provider-upload-file',
    });
  }
}
