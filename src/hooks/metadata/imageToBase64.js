/**
 * Convert image URL to base64 data URL with optimization
 */
export function imageToBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxWidth = 800;
        const maxHeight = 600;
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({
          dataUrl,
          originalUrl: imageUrl,
          size: Math.round(dataUrl.length * 0.75),
          dimensions: { width, height },
          timestamp: Date.now()
        });
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    if (imageUrl.startsWith('/')) {
      img.src = `${window.location.origin}${imageUrl}`;
    } else {
      img.src = imageUrl;
    }
  });
}
