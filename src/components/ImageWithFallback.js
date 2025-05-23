"use client";
import React, { useState } from 'react';
import Image from 'next/image';

const VERCEL_BLOB_BASE_URL = "https://n7alj90bp0isqv2j.public.blob.vercel-storage.com/data";

export default function ImageWithFallback({ imagePath, alt, fill, className, style, sizes }) {
  // State to track if loading from Vercel Blob has failed for this specific image
  const [hasVercelBlobFailed, setHasVercelBlobFailed] = useState(false);
  // State to track if loading from the local fallback has also failed
  const [hasLocalFallbackFailed, setHasLocalFallbackFailed] = useState(false);
  
  const isVercel = !!process.env.NEXT_PUBLIC_VERCEL; 

  // Determine the source URL based on environment and fallback status
  let currentSrc;
  if (isVercel && !hasVercelBlobFailed) {
    currentSrc = `${VERCEL_BLOB_BASE_URL}${imagePath}`;
  } else if (!isVercel && !hasLocalFallbackFailed) {
    currentSrc = `${imagePath}`;
  } else if (hasLocalFallbackFailed) {
    currentSrc = `${VERCEL_BLOB_BASE_URL}${imagePath}`;
  } else if (isVercel && hasVercelBlobFailed) {
    currentSrc = `${imagePath}`;
  }

  return (
    <Image
      src={currentSrc}
      alt={alt} 
      fill={fill} 
      className={className} 
      style={style} 
      sizes={sizes} 
      // If the image fails to load, handle the fallback logic
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
}