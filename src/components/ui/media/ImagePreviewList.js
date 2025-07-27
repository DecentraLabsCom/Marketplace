import React from 'react'
import PropTypes from 'prop-types'
import { XCircle } from 'lucide-react'
import MediaDisplayWithFallback from '@/components/ui/media/MediaDisplayWithFallback'

const ImagePreviewList = React.memo(function ImagePreviewList({ imageUrls, removeImage, isExternalURI }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {imageUrls.map((url, index) => (
        <div key={index} className="relative group h-20 w-full">
          <MediaDisplayWithFallback mediaPath={url} mediaType={'image'} 
            alt={`Preview ${index}`} fill unoptimized className="object-cover rounded" />
          <button
            type="button"
            onClick={() => removeImage(index)}
            className="absolute top-0 right-0 bg-red-500 text-white rounded-full opacity-0 
              group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
            disabled={isExternalURI}
          >
            <XCircle className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
});

ImagePreviewList.propTypes = {
  imageUrls: PropTypes.arrayOf(PropTypes.string).isRequired,
  removeImage: PropTypes.func.isRequired,
  isExternalURI: PropTypes.bool
}

ImagePreviewList.defaultProps = {
  isExternalURI: false
}

export default ImagePreviewList;
