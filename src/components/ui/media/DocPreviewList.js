import React from 'react'
import PropTypes from 'prop-types'
import { XCircle } from 'lucide-react'
import MediaDisplayWithFallback from '@/components/ui/media/MediaDisplayWithFallback'

const DocPreviewList = React.memo(function DocPreviewList({ docUrls, removeDoc, isExternalURI }) {
  if (!docUrls?.length) return null;
  return (
    <div className="mt-2">
      <p className="text-sm text-gray-500">Uploaded Documents:</p>
      <ul className="list-disc list-inside">
        {docUrls.map((url, index) => {
          const filename = url.split('/').pop();
          return (
            <li key={index} className="text-sm flex items-center justify-between">
              <MediaDisplayWithFallback
                mediaPath={url}
                mediaType="link"
                title={filename}
                className="text-blue-500 hover:underline"
                height="auto"
                width="auto"
              />
              <button
                type="button"
                onClick={() => removeDoc(index)}
                className="text-red-500 hover:text-red-700 disabled:cursor-not-allowed"
                disabled={isExternalURI}
              >
                <XCircle className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

DocPreviewList.propTypes = {
  docUrls: PropTypes.arrayOf(PropTypes.string).isRequired,
  removeDoc: PropTypes.func.isRequired,
  isExternalURI: PropTypes.bool
}

DocPreviewList.defaultProps = {
  isExternalURI: false
}

export default DocPreviewList;
