"use client";
import React, { useState, useEffect } from 'react';
import Image from 'next/image';

export default function MediaDisplayWithFallback({ 
  mediaPath, 
  mediaType, // 'image' or 'doc'
  alt, 
  fill, 
  className, 
  style, 
  sizes,
  height,
  width,
  title
}) {
   const VERCEL_BLOB_BASE_URL = "https://n7alj90bp0isqv2j.public.blob.vercel-storage.com/data";
  // State to control whether to attempt the Blob URL (true) or if it failed and we should use the local one (false) for images
  const [hasVercelBlobFailed, setHasVercelBlobFailed] = useState(false);
  // State to control if loading from the local fallback has also failed
  const [hasLocalFallbackFailed, setHasLocalFallbackFailed] = useState(false); // Restored
  
  const isVercel = !!process.env.NEXT_PUBLIC_VERCEL; 

  // Reset states when `mediaPath` or `mediaType` change.
  useEffect(() => {
    setHasVercelBlobFailed(false);
    setHasLocalFallbackFailed(false);
  }, [mediaPath, mediaType]);

  if (mediaType === 'image') {
    let currentSrc;
    if (isVercel && !hasVercelBlobFailed) {
      currentSrc = `${VERCEL_BLOB_BASE_URL}${mediaPath}`;
    } else if (!isVercel && !hasLocalFallbackFailed) {
      currentSrc = `${mediaPath}`;
    } else if (hasLocalFallbackFailed) {
      currentSrc = `${VERCEL_BLOB_BASE_URL}${mediaPath}`;
    } else if (isVercel && hasVercelBlobFailed) {
      currentSrc = `${mediaPath}`;
    }

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
            setHasVercelBlobFailed(true);
          } else if (!isVercel && !hasLocalFallbackFailed) {
            setHasLocalFallbackFailed(true);
          } else if (hasLocalFallbackFailed) {
            setHasLocalFallbackFailed(false);
          } else if (isVercel && hasVercelBlobFailed) {
            setHasVercelBlobFailed(false);
          }
        }}
      />
    );
  } else if (mediaType === 'doc') {
    let currentDocSrc;
    // if (isVercel && !hasVercelBlobFailed) {
    //   currentDocSrc = `${VERCEL_BLOB_BASE_URL}${mediaPath}`;
    // } else if (!isVercel && !hasLocalFallbackFailed) {
    //   currentDocSrc = `${mediaPath}`;
    // } else if (hasLocalFallbackFailed) {
    //   currentDocSrc = `${VERCEL_BLOB_BASE_URL}${mediaPath}`;
    // } else if (isVercel && hasVercelBlobFailed) {
    //   currentDocSrc = `${mediaPath}`;
    // }

    currentDocSrc = `${VERCEL_BLOB_BASE_URL}${mediaPath}`;

    console.log('currentDocSrc:', currentDocSrc);

    return (
      <iframe 
        src={currentDocSrc}
        title={title} 
        height={height} 
        width={width} 
        className={className}
        onError={(e) => {
          console.error(`[MediaDisplayWithFallback] Iframe DOM error (may not be network-related):`, e);
          if (isVercel && !hasVercelBlobFailed) {
            setHasVercelBlobFailed(true);
          } else if (!isVercel && !hasLocalFallbackFailed) {
            setHasLocalFallbackFailed(true);
          } else if (hasLocalFallbackFailed) {
            setHasLocalFallbackFailed(false);
          } else if (isVercel && hasVercelBlobFailed) {
            setHasVercelBlobFailed(false);
          } 
          
        }}
      ></iframe>
    );
  }

  // If mediaType is not recognized
  return null;
}