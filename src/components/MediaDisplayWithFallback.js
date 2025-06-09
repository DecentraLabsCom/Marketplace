"use client";
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { XCircle } from 'lucide-react';

export default function MediaDisplayWithFallback({ 
  mediaPath, 
  mediaType, // 'image', 'doc' or 'link'
  alt, 
  fill, 
  className, 
  style, 
  sizes,
  height,
  width,
  title
}) {
  
  // State to control if we should try Vercel Blob URL (false initially) or if it failed (true) for IMAGES
  const [hasVercelBlobFailed, setHasVercelBlobFailed] = useState(false);
  // State to control if local fallback for IMAGES has also failed
  const [hasLocalFallbackFailed, setHasLocalFallbackFailed] = useState(false);
  
  const isVercel = !!process.env.NEXT_PUBLIC_VERCEL; 

  // --- States for Document (iframe) handling ---
  const [currentDocSrc, setCurrentDocSrc] = useState(''); // The final URL for the iframe src
  const [isLoadingDoc, setIsLoadingDoc] = useState(true); // True when fetching/determining doc URL
  const [hasDocError, setHasDocError] = useState(false); // True if all doc fallbacks failed
  // 0: Initial/External check, 1: Vercel Blob attempt, 2: Local attempt, 3: All failed
  const [docAttemptPhase, setDocAttemptPhase] = useState(0); 

  // --- Internal utility function ---
  const getSourceUrl = (path, attemptBlob, isVercelEnv) => {
    // Clean path by removing leading slash if present, for consistent concatenation
    const cleanedPath = typeof path === 'string' ? path.replace(/^\//, '') : '';

    // 1. If it's already an external URL (http/https), return it directly.
    if (typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'))) {
      return path;
    }

    // 2. Otherwise, apply Blob/local logic
    if (isVercelEnv && attemptBlob) {
      // Construct Vercel Blob URL
      return `${process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL}/data/${cleanedPath}`;
    } 
    // 3. If not attempting Blob or it fails, attempt local path
    else {
      // Construct local public path
      return `/${cleanedPath}`;
    }
  };

  // Reset states when `mediaPath` or `mediaType` changes
  useEffect(() => {
    // Reset states for Image fallback logic
    setHasVercelBlobFailed(false); 
    setHasLocalFallbackFailed(false); 

    // Reset states for Document fallback logic
    setCurrentDocSrc('');
    setIsLoadingDoc(true);
    setHasDocError(false);
    setDocAttemptPhase(0); // Always start from the first attempt phase
  }, [mediaPath, mediaType]);

  // --- Effect for Document (iframe) URL determination and Fetch Fallback ---
  useEffect(() => {
    // This effect runs for both 'doc' (iframe) and 'link' (a) types
    if (mediaType !== 'doc' && mediaType !== 'link') return;

    setIsLoadingDoc(true); // Indicate that we are trying to load
    setHasDocError(false); // Clear previous errors

    const abortController = new AbortController();
    const signal = abortController.signal;

    const executeDocAttempt = async () => {
      let urlToAttempt = '';
      let currentAttemptType = '';

      // --- Determine URL based on phase and type ---
      if (docAttemptPhase === 0) { // Phase 0: External URL check
        if (typeof mediaPath === 'string' && (mediaPath.startsWith('http://') 
          || mediaPath.startsWith('https://'))) {
          urlToAttempt = mediaPath;
          currentAttemptType = 'External';
          // Since we can't fetch external URLs reliably, we'll set it directly for iframe
          setCurrentDocSrc(urlToAttempt);
          setIsLoadingDoc(false);
          return;
        } else {
          // If phase 0 was for external but mediaPath is not external, move to next phase
          setDocAttemptPhase(1); // Move to Phase 1 (Vercel Blob)
          return;
        }
      } else if (docAttemptPhase === 1) { // Phase 1: Vercel Blob attempt
        if (isVercel) {
          urlToAttempt = getSourceUrl(mediaPath, true, isVercel);
          currentAttemptType = 'Vercel Blob';
        } else if (!isVercel) {
          urlToAttempt = getSourceUrl(mediaPath, true, !isVercel);
          currentAttemptType = 'Vercel Blob';
        } else {
          // If blob fails, skip Blob phase and move to local
          setDocAttemptPhase(2); // Move to Phase 2 (Local)
          return;
        }
      } else if (docAttemptPhase === 2) { // Phase 2: Local attempt
        urlToAttempt = getSourceUrl(mediaPath, false, isVercel);
        currentAttemptType = 'Local';
      } else { // Phase 3 or higher: All attempts failed
        setHasDocError(true);
        setIsLoadingDoc(false);
        return;
      }

      // If no valid URL to attempt after determining phase, set error
      if (!urlToAttempt) {
        setHasDocError(true);
        setIsLoadingDoc(false);
        return;
      }

      // Proceed with fetch for Vercel Blob and Local URLs
      try {
        const response = await fetch(urlToAttempt, { signal });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status} for ${urlToAttempt}`);
        }

        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/pdf')) {
          throw new Error(`Expected Content-Type 'application/pdf', but received '${contentType || 'none'}' 
            for ${urlToAttempt}`);
        }

        // If success
        setCurrentDocSrc(urlToAttempt); // Set the URL for the iframe
        setIsLoadingDoc(false); // Done loading
        setHasDocError(false); // No error
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.warn(`Fetch failed for doc from ${currentAttemptType}: ${urlToAttempt}. Error: ${error.message}`);
        
        // Move to the next attempt phase
        setDocAttemptPhase(prevPhase => prevPhase + 1);
      }
    };

    executeDocAttempt();

    return () => {
      abortController.abort(); 
    };

  }, [mediaPath, mediaType, isVercel, docAttemptPhase]);

  // --- Render Logic for Images ---
  if (mediaType === 'image') {
    function getImageSrc({ isVercel, hasVercelBlobFailed, hasLocalFallbackFailed, mediaPath }) {
      const cleanedMediaPath = typeof mediaPath === 'string' ? mediaPath.replace(/^\//, '').trim() : '';
      const blobUrl = `${process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL}/data/${cleanedMediaPath}`;
      const localUrl = `${mediaPath.trim()}`;
      // if (isVercel) {
      //   return hasVercelBlobFailed ? localUrl : blobUrl;
      // } else {
      //   return hasLocalFallbackFailed ? blobUrl : localUrl;
      // }
      if (isVercel && !hasVercelBlobFailed) {
        return blobUrl;
      } else if (!isVercel && !hasLocalFallbackFailed) {
        return localUrl;
      } else if (hasLocalFallbackFailed) {
        return blobUrl;
      }else if (isVercel && hasVercelBlobFailed) {
        return localUrl;
      }
    }

    const currentSrc = getImageSrc({ isVercel, hasVercelBlobFailed, hasLocalFallbackFailed, mediaPath });

    return (
      <Image
        src={currentSrc}
        alt={alt} 
        fill={fill} 
        className={className} 
        style={style} 
        sizes={sizes} 
        onError={(e) => {
          if (isVercel && !hasVercelBlobFailed) {
            setHasVercelBlobFailed(true); // Try local fallback
          } else if (!isVercel && !hasLocalFallbackFailed) {
            setHasLocalFallbackFailed(true); // Try blob fallback
          }
        }}
      />
    );
  } 
  // --- Render Logic for Documents (iframe and link) ---
  else if (mediaType === 'doc' || mediaType === 'link') {
    // Get filename for display in link or error messages
    const filename = typeof mediaPath === 'string' ? mediaPath.split('/').pop() : 'Document';

    if (isLoadingDoc) {
      return (
        <div className="flex items-center justify-center bg-gray-200 text-gray-700 rounded-lg" 
        style={{ height: height, width: width }}>
          Loading document...
        </div>
      );
    }

    if (hasDocError) {
      return (
        <div className="flex flex-col items-center justify-center bg-red-100 text-red-700 rounded-lg p-4 
        text-center" style={{ height: height, width: width }}>
          <XCircle className="h-8 w-8 mb-2" />
          <p>Document could not be loaded.</p>
          <p className="text-sm">Please check the URL or try again.</p>
        </div>
      );
    }

    // Only render the iframe or link once a valid currentDocSrc has been determined and no error
    if (currentDocSrc) {
      if (mediaType === 'doc') {
        return (
          <iframe 
            src={currentDocSrc} // Use the URL determined by the fetch logic
            title={title} 
            height={height} 
            width={width} 
            className={className}
            onError={(e) => {
              setHasDocError(true);
              setIsLoadingDoc(false);
            }}
          ></iframe>
        );
      } else if (mediaType === 'link') {
        return (
          <a
            href={currentDocSrc}
            target="_blank" // Open in new tab
            rel="noopener noreferrer"
            className={`text-blue-500 hover:underline flex items-center justify-center ${className}`}
            style={{ height: height, width: width, ...style }}
            title={title || filename}
          >
            {filename}
          </a>
        );
      }
    }
  }

  // If mediaType is not recognized or no valid src found
  return null;
}