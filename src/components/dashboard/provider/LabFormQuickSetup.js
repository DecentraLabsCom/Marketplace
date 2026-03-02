import PropTypes from 'prop-types'

/**
 * Quick lab setup form for simplified lab creation with minimal required fields
 * Provides streamlined interface for providers to quickly publish labs
 * @param {Object} props
 * @param {Object} props.localLab - Local lab state object with basic fields
 * @param {Function} props.setLocalLab - Function to update local lab state
 * @param {Object} props.errors - Validation errors object
 * @param {boolean} props.isLocalURI - Whether using local URI (disables editing)
 * @param {React.RefObject} props.priceRef - Ref for price input field
 * @param {React.RefObject} props.accessURIRef - Ref for access URI input field
 * @param {React.RefObject} props.accessKeyRef - Ref for access key input field
 * @param {React.RefObject} props.uriRef - Ref for URI input field
 * @param {boolean} props.clickedToEditUri - Whether URI edit mode is active
 * @param {Function} props.setClickedToEditUri - Function to toggle URI edit mode
 * @param {Function} props.handleUriChange - Handler for URI changes
 * @param {Function} props.onSubmit - Form submission handler
 * @param {Function} props.onCancel - Form cancellation handler
 * @param {Object} props.lab - Original lab object for reference
 * @returns {JSX.Element} Quick setup form with essential lab fields
 */
export default function LabFormQuickSetup({ localLab, setLocalLab, errors, isLocalURI, priceRef,
  accessURIRef, accessKeyRef, uriRef, clickedToEditUri, setClickedToEditUri, handleUriChange,
  onSubmit, onCancel, lab }) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <input
        type="number"
        step="any"
        min="0"
        placeholder="Price per hour"
        value={localLab?.price || ''}
        onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
        className="w-full p-2.5 rounded-lg text-gray-900 placeholder-gray-400 
        disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-primary-500/50 bg-white border border-gray-300"
        disabled={isLocalURI}
        ref={priceRef}
      />
      {errors.price && <p className="text-red-500 text-sm !mt-1">{errors.price}</p>}

      <input
        type="text"
        placeholder="Access URI"
        value={localLab?.accessURI || ''}
        onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
        className="w-full p-2.5 rounded-lg text-gray-900 placeholder-gray-400 
        disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-primary-500/50 bg-white border border-gray-300"
        disabled={isLocalURI}
        ref={accessURIRef}
      />
      {errors.accessURI && <p className="text-red-500 text-sm !mt-1">{errors.accessURI}</p>}

      <input
        type="text"
        placeholder="Access Key"
        value={localLab?.accessKey || ''}
        onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
        className="w-full p-2.5 rounded-lg text-gray-900 placeholder-gray-400 
        disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-primary-500/50 bg-white border border-gray-300"
        disabled={isLocalURI}
        ref={accessKeyRef}
      />
      {errors.accessKey && <p className="text-red-500 text-sm !mt-1">{errors.accessKey}</p>}

      <input
        type="text"
        placeholder="Lab Data URL (JSON)"
        value={localLab?.uri || ''}
        onChange={handleUriChange}
        onClick={() => isLocalURI && setClickedToEditUri(true)}
        onBlur={() => isLocalURI && setClickedToEditUri(false)}
        readOnly={isLocalURI && !clickedToEditUri}
        className={`w-full p-2.5 rounded-lg text-gray-900 placeholder-gray-400 
        focus:outline-none focus:ring-2 focus:ring-primary-500/50 bg-white border border-gray-300 ${
          isLocalURI && !clickedToEditUri
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : ''
        }`}
        ref={uriRef}
      />
      {errors.uri && !(clickedToEditUri && isLocalURI) &&
        <p className="text-red-500 text-sm !mt-1">{errors.uri}</p>
      }
      {isLocalURI && !clickedToEditUri && (
        <div className='mt-4 flex justify-center'>
          <span className="text-sm text-amber-400 font-medium">
            While greyed out, you may edit the JSON file field to add it as a link
          </span>
        </div>
      )}
      {clickedToEditUri && isLocalURI && (
        <ol className="text-amber-400 text-sm !mt-1 !list-decimal ml-5">
          <li>Name changes to the JSON file are not allowed and will be ignored</li>
          <li>
            Introducing a link to a JSON file will replace the data in Full Setup with the information 
            contained in the linked JSON
          </li>
        </ol>
      )}

      <div className="flex justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--color-ui-label-medium)' }}>
        <button type="submit"
          className="text-white px-5 py-2.5 rounded-lg font-medium bg-success hover:bg-success-dark transition-colors shadow-sm">
          {lab?.id ? 'Save Changes' : 'Add Lab'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-white px-5 py-2.5 rounded-lg font-medium bg-slate-600 hover:bg-slate-500 transition-colors">
          Close
        </button>
      </div>
    </form>
  );
}

LabFormQuickSetup.propTypes = {
  localLab: PropTypes.object.isRequired,
  setLocalLab: PropTypes.func.isRequired,
  errors: PropTypes.object,
  isLocalURI: PropTypes.bool,
  priceRef: PropTypes.object,
  authRef: PropTypes.object,
  accessURIRef: PropTypes.object,
  accessKeyRef: PropTypes.object,
  uriRef: PropTypes.object,
  clickedToEditUri: PropTypes.bool,
  setClickedToEditUri: PropTypes.func,
  handleUriChange: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  lab: PropTypes.object
}
