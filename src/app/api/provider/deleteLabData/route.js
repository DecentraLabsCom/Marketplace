/**
 * API endpoint for deleting lab data from storage
 * Handles POST requests to remove lab data files from local or cloud storage
 * 
 * SECURITY: Requires authentication and lab ownership verification
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'
import {
  requireAuth, 
  requireLabOwner, 
  handleGuardError,
  HttpError,
  BadRequestError
} from '@/utils/auth/guards'
import { resolveManagedLocalPath } from '@/utils/storage/fileSecurity'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'provider-delete-lab-data', windowMs: 60_000, maxRequests: 10 })
const MANAGED_METADATA_PATTERN = /^Lab-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
const LAB_ID_PATTERN = /^(?:0|[1-9][0-9]*)$/

function extractManagedMetadataUri(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const candidate = value.trim()
  if (MANAGED_METADATA_PATTERN.test(candidate)) return candidate

  try {
    const parsed = new URL(candidate, 'http://localhost')
    const queryUri = parsed.searchParams.get('uri')
    if (MANAGED_METADATA_PATTERN.test(queryUri || '')) return queryUri
    const pathMatch = parsed.pathname.match(/(Lab-[A-Za-z0-9][A-Za-z0-9._-]*\.json)$/)
    return pathMatch?.[1] || null
  } catch {
    return null
  }
}

/**
 * Deletes lab data file from storage
 * @param {Request} req - HTTP request with lab data to delete
 * @param {Object} req.body - Request body
 * @param {string} req.body.labURI - URI/filename of lab data to delete (required)
 * @param {string|number} [req.body.labId] - Minted ERC-721 ID when the filename
 * was generated before the global ID was known
 * @returns {Response} JSON response with deletion result or error
 */
export async function POST(req) {
  try {
    // ===== AUTHENTICATION =====
    // Require a valid authenticated session
    const session = await requireAuth();
    const rateLimitResponse = createRateLimitResponse(await checkRate(req, session));
    if (rateLimitResponse) return rateLimitResponse;
    
    const { labURI, labId: requestedLabId } = await req.json();
    
    // Validate required parameters
    if (!labURI || typeof labURI !== 'string' || labURI.trim() === '') {
      return NextResponse.json({ 
        error: 'Missing or invalid labURI parameter',
        message: 'labURI is required and must be a non-empty string' 
      }, { status: 400 });
    }

    const sanitizedLabURI = extractManagedMetadataUri(labURI)
    if (!sanitizedLabURI) {
      throw new BadRequestError('Invalid lab data URI');
    }

    // ===== AUTHORIZATION =====
    // A managed filename is a provider-local storage key, not necessarily the
    // globally assigned ERC-721 ID. Prefer the explicit ID returned by mint;
    // retain suffix extraction for legacy callers.
    const normalizedRequestedLabId = requestedLabId === undefined || requestedLabId === null
      ? ''
      : String(requestedLabId).trim()
    const labIdMatch = sanitizedLabURI.match(/-(\d+)\.json$/)
    const labId = normalizedRequestedLabId || labIdMatch?.[1]
    if (!LAB_ID_PATTERN.test(labId || '')) {
      throw new BadRequestError('Unable to determine lab ID from URI');
    }
    await requireLabOwner(session, labId);
    
    const isVercel = getIsVercel();

    devLog.log('DELETE_LAB_DATA', `Attempting to delete lab data: ${sanitizedLabURI} on ${isVercel ? 'Vercel' : 'local'}`);

    if (!isVercel) {
        // Local filesystem deletion
        const filePath = resolveManagedLocalPath(path.join(process.cwd(), 'data'), sanitizedLabURI);
        
        try {
          await fs.unlink(filePath);
          devLog.log('DELETE_LAB_DATA', `Successfully deleted local file: ${filePath}`);
          
          return NextResponse.json({ 
            message: 'Lab data deleted successfully',
            deleted: sanitizedLabURI,
            timestamp: new Date().toISOString()
          }, { status: 200 });
          
        } catch (fsError) {
          console.error('Local file deletion error:', fsError);
          
          if (fsError.code === 'ENOENT') {
            return NextResponse.json(
              { 
                error: 'Lab data not found', 
                message: 'The requested lab data was not found.',
                code: 'LAB_DATA_NOT_FOUND',
              },
              { status: 404 }
            );
          }

          return publicErrorResponse({
            status: 500,
            code: 'LOCAL_LAB_DATA_DELETE_ERROR',
            message: 'The lab data could not be deleted.',
            error: fsError,
            context: 'provider-delete-lab-data-local',
          });
        }
    } else {
        // Vercel blob deletion
        try {
            const blobPath = `data/${sanitizedLabURI}`;
            const result = await del(blobPath);
            
            devLog.log('DELETE_LAB_DATA', `Blob deletion result for ${blobPath}:`, result);
            
            return NextResponse.json({ 
              message: 'Lab data deleted successfully',
              deleted: sanitizedLabURI,
              blobPath,
              timestamp: new Date().toISOString()
            }, { status: 200 });
            
        } catch (blobError) {
            console.error('Vercel blob deletion error:', blobError);
            
            return publicErrorResponse({
              status: 500,
              code: 'BLOB_LAB_DATA_DELETE_ERROR',
              message: 'The lab data could not be deleted.',
              error: blobError,
              context: 'provider-delete-lab-data-blob',
            });
        }
    }

  } catch (parseError) {
    // Handle authentication/authorization errors
    if (parseError instanceof HttpError) {
      return handleGuardError(parseError, req);
    }
    
    return publicErrorResponse({
      status: 400,
      code: 'INVALID_REQUEST_FORMAT',
      message: 'The request body is invalid.',
      error: parseError,
      context: 'provider-delete-lab-data-request',
    });
  }
}
