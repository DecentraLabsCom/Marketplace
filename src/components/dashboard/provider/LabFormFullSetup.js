import PropTypes from 'prop-types'
import { UploadCloud, Link, XCircle } from 'lucide-react'
import ImagePreviewList from '@/components/ui/media/ImagePreviewList.js'
import DocPreviewList from '@/components/ui/media/DocPreviewList.js'

/**
 * Comprehensive lab setup form with all available fields and file upload capabilities
 * Handles both image and document uploads, with support for external URIs
 * @param {Object} props
 * @param {Object} props.localLab - Local lab state object
 * @param {Function} props.setLocalLab - Function to update local lab state
 * @param {Object} props.errors - Validation errors object
 * @param {boolean} props.isExternalURI - Whether lab is using external URI
 * @param {string} props.imageInputType - Current image input type ('link' or 'upload')
 * @param {Function} props.setImageInputType - Function to set image input type
 * @param {Array<string>} props.imageUrls - Array of image URLs
 * @param {React.RefObject} props.imageLinkRef - Ref for image link input
 * @param {React.RefObject} props.imageUploadRef - Ref for image upload input
 * @param {Function} props.handleImageChange - Function to handle image changes
 * @param {Function} props.removeImage - Function to remove image at index
 * @param {Array<File>} props.localImages - Array of local image files
 * @param {string} props.docInputType - Current document input type ('link' or 'upload')
 * @param {Function} props.setDocInputType - Function to set document input type
 * @param {Array<string>} props.docUrls - Array of document URLs
 * @param {React.RefObject} props.docLinkRef - Ref for document link input
 * @param {React.RefObject} props.docUploadRef - Ref for document upload input
 * @param {Function} props.handleDocChange - Function to handle document changes
 * @param {Function} props.removeDoc - Function to remove document at index
 * @param {Array<File>} props.localDocs - Array of local document files
 * @param {React.RefObject} props.nameRef - Ref for name input
 * @param {React.RefObject} props.categoryRef - Ref for category input
 * @param {React.RefObject} props.keywordsRef - Ref for keywords input
 * @param {React.RefObject} props.descriptionRef - Ref for description input
 * @param {React.RefObject} props.priceRef - Ref for price input
 * @param {React.RefObject} props.authRef - Ref for auth input
 * @param {React.RefObject} props.accessURIRef - Ref for access URI input
 * @param {React.RefObject} props.accessKeyRef - Ref for access key input
 * @param {React.RefObject} props.timeSlotsRef - Ref for time slots input
 * @param {React.RefObject} props.opensRef - Ref for opening time input
 * @param {React.RefObject} props.closesRef - Ref for closing time input
 * @param {Function} props.onSubmit - Form submission handler
 * @param {Function} props.onCancel - Form cancellation handler
 * @returns {JSX.Element} Full lab setup form component
 */
export default function LabFormFullSetup({ localLab, setLocalLab, errors, isExternalURI, imageInputType,
  setImageInputType, imageUrls, imageLinkRef, imageUploadRef, handleImageChange, removeImage, localImages,
  docInputType, setDocInputType, docUrls, docLinkRef, docUploadRef, handleDocChange, removeDoc, localDocs,
  nameRef, categoryRef, keywordsRef, descriptionRef, priceRef, authRef, accessURIRef, accessKeyRef,
  timeSlotsRef, opensRef, closesRef, onSubmit, onCancel }) {
  return (
    <form className="space-y-4 text-gray-600" onSubmit={onSubmit}>
      {isExternalURI && (
        <div className='mt-4 flex justify-center'>
            <span className="text-sm text-red-500 font-medium">
            To edit these fields, first remove the link to the JSON file in Quick Setup
            </span>
        </div>
      )}
      <input
        type="text"
        placeholder="Lab Name"
        value={localLab?.name || ''}
        onChange={(e) => setLocalLab({ ...localLab, name: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={nameRef}
      />
      {errors.name && <p className="text-red-500 text-sm !mt-1">{errors.name}</p>}
      <input
        type="text"
        placeholder="Category"
        value={localLab?.category || ''}
        onChange={(e) => setLocalLab({ ...localLab, category: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={categoryRef}
      />
      {errors.category && <p className="text-red-500 text-sm !mt-1">{errors.category}</p>}
      <input
        type="text"
        placeholder="Keywords (comma-separated)"
        value={Array.isArray(localLab?.keywords) ? localLab.keywords.join(',') : ''}
        onChange={(e) =>
          setLocalLab({ ...localLab, keywords: e.target.value.split(',') })
        }
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={keywordsRef}
      />
      {errors.keywords && <p className="text-red-500 text-sm !mt-1">{errors.keywords}</p>}
      <textarea
        placeholder="Description"
        value={localLab?.description || ''}
        onChange={(e) => setLocalLab({ ...localLab, description: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={descriptionRef}
      />
      {errors.description && <p className="text-red-500 text-sm !mt-[-2px]">{errors.description}</p>}
      <input
        type="number"
        step="any"
        placeholder="Price"
        value={localLab?.price || ''}
        onChange={(e) => setLocalLab({ ...localLab, price: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={priceRef}
      />
      {errors.price && <p className="text-red-500 text-sm !mt-1">{errors.price}</p>}
      <input
        type="text"
        placeholder="Auth URL"
        value={localLab?.auth || ''}
        onChange={(e) => setLocalLab({ ...localLab, auth: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={authRef}
      />
      {errors.auth && <p className="text-red-500 text-sm !mt-1">{errors.auth}</p>}
      <input
        type="text"
        placeholder="Access URI"
        value={localLab?.accessURI || ''}
        onChange={(e) => setLocalLab({ ...localLab, accessURI: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={accessURIRef}
      />
      {errors.accessURI && <p className="text-red-500 text-sm !mt-1">{errors.accessURI}</p>}
      <input
        type="text"
        placeholder="Access Key"
        value={localLab?.accessKey || ''}
        onChange={(e) => setLocalLab({ ...localLab, accessKey: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={accessKeyRef}
      />
      {errors.accessKey && <p className="text-red-500 text-sm !mt-1">{errors.accessKey}</p>}
      <input
        type="text"
        placeholder="Time Slots (comma-separated)"
        value={Array.isArray(localLab?.timeSlots) ? localLab.timeSlots.join(',') : ''}
        onChange={(e) =>
          setLocalLab({ ...localLab, timeSlots: e.target.value.split(',') })
        }
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={timeSlotsRef}
      />
      {errors.timeSlots && <p className="text-red-500 text-sm !mt-1">{errors.timeSlots}</p>}
      <input
        type="text"
        placeholder="Opens (e.g. 08/31/2025)"
        value={localLab?.opens || ''}
        onChange={(e) => setLocalLab({ ...localLab, opens: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={opensRef}
      />
      {errors.opens && <p className="text-red-500 text-sm !mt-1">{errors.opens}</p>}
      <input
        type="text"
        placeholder="Closes (e.g. 12/31/2025)"
        value={localLab?.closes || ''}
        onChange={(e) => setLocalLab({ ...localLab, closes: e.target.value })}
        className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
        disabled:cursor-not-allowed disabled:border-gray-300"
        disabled={isExternalURI}
        ref={closesRef}
      />
      {errors.closes && <p className="text-red-500 text-sm !mt-1">{errors.closes}</p>}

      {/* Images */}
      <div className="space-y-2">
        <h4 className="font-semibold">Images</h4>
        <div className="flex">
          <button
            type="button"
            className={`px-4 py-2 rounded mr-2 ${imageInputType === 'link'
              ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' +
                'disabled:cursor-not-allowed disabled:border-gray-300'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' + 
                'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
            onClick={() => setImageInputType('link')}
            disabled={isExternalURI}
          >
            <div className='flex items-center justify-center'>
              <Link className="mr-2 ml-[-2px] w-4" />
              <span>Link</span>
            </div>
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded ${imageInputType === 'upload'
              ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' +
                'disabled:cursor-not-allowed disabled:border-gray-300'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' + 
                'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
            onClick={() => setImageInputType('upload')}
            disabled={isExternalURI}
          >
            <div className='flex items-center justify-center'>
              <UploadCloud className="mr-2 size-4" />
              <span>Upload</span>
            </div>
          </button>
        </div>
        {imageInputType === 'link' && (
          <input
            type="text"
            placeholder="Image URLs (comma-separated)"
            value={Array.isArray(localLab?.images) ? localLab.images.join(',') : ''}
            onChange={(e) =>
              setLocalLab({ ...localLab, images: e.target.value.split(',') })
            }
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
            disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={isExternalURI}
            ref={imageLinkRef}
          />
        )}
        {errors.images && <p className="text-red-500 text-sm mt-1">{errors.images}</p>}
        {imageInputType === 'upload' && (
          <>
            <input
              type="file"
              multiple
              onChange={handleImageChange}
              className="w-full"
              disabled={isExternalURI}
              ref={imageUploadRef}
              style={{ display: 'none' }}
              accept="image/*"
            />
            <button
              type="button"
              onClick={() => imageUploadRef.current?.click()}
              className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full 
              disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
              disabled:border-gray-300"
              disabled={isExternalURI}
            >
              <div className='flex items-center justify-center'>
                <UploadCloud className="mr-2 size-4" />
                <span>Choose Files</span>
              </div>
            </button>
            {localImages.length > 0 && (
              <div className="mt-2">
                <p className="text-sm text-gray-500">Selected Files:</p>
                <ul className="list-disc list-inside">
                  {localImages.map((file, index) => (
                    <li key={index} className="text-sm flex items-center justify-between">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {imageUrls.length > 0 && (
              <ImagePreviewList imageUrls={imageUrls} removeImage={removeImage} isExternalURI={isExternalURI} />
            )}
          </>
        )}
      </div>

      {/* Documents */}
      <div className="space-y-2">
        <h4 className="font-semibold">Documents</h4>
        <div className="flex">
          <button
            type="button"
            className={`px-4 py-2 rounded mr-2 ${docInputType === 'link'
              ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' + 
                'disabled:cursor-not-allowed disabled:border-gray-300'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' + 
                'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
            onClick={() => setDocInputType('link')}
            disabled={isExternalURI}
          >
            <div className='flex items-center justify-center'>
              <Link className="mr-2 ml-[-2px] w-4" />
              <span>Link</span>
            </div>
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded ${docInputType === 'upload'
              ? 'bg-[#7875a8] text-white disabled:bg-gray-500 disabled:text-gray-300 ' + 
                'disabled:cursor-not-allowed disabled:border-gray-300'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-200 ' +
                'disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-300'}`}
            onClick={() => setDocInputType('upload')}
            disabled={isExternalURI}
          >
            <div className='flex items-center justify-center'>
              <UploadCloud className="mr-2 ml-[-2px] w-4" />
              <span>Upload</span>
            </div>
          </button>
        </div>
        {docInputType === 'link' && (
          <input
            type="text"
            placeholder="Docs URLs (comma-separated)"
            value={Array.isArray(localLab?.docs) ? localLab.docs.join(',') : ''}
            onChange={(e) =>
              setLocalLab({ ...localLab, docs: e.target.value.split(',') })
            }
            className="w-full p-2 border rounded disabled:bg-gray-200 disabled:text-gray-400 
            disabled:cursor-not-allowed disabled:border-gray-300"
            disabled={isExternalURI}
            ref={docLinkRef}
          />
        )}
        {errors.docs && <p className="text-red-500 text-sm mt-1">{errors.docs}</p>}
        {docInputType === 'upload' && (
          <>
            <input
              type="file"
              multiple
              onChange={handleDocChange}
              className="w-full"
              ref={docUploadRef}
              style={{ display: 'none' }}
              accept="application/pdf"
            />
            <button
              type="button"
              onClick={() => docUploadRef.current?.click()}
              className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded w-full 
              disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed 
              disabled:border-gray-300"
              disabled={isExternalURI}
            >
              <div className='flex items-center justify-center'>
                <UploadCloud className="mr-2 size-4" />
                <span>Choose Files</span>
              </div>
            </button>
            {localDocs.length > 0 && (
              <div className="mt-2">
                <p className="text-sm text-gray-500">Selected Files:</p>
                <ul className="list-disc list-inside">
                  {localDocs.map((file, index) => (
                    <li key={index} className="text-sm flex items-center justify-between">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeDoc(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {docUrls.length > 0 && (
              <DocPreviewList docUrls={docUrls} removeDoc={removeDoc} isExternalURI={isExternalURI} />
            )}
          </>
        )}
      </div>
      <div className="flex justify-between mt-4">
        <button type="submit"
          disabled={isExternalURI}
          className="text-white px-4 py-2 rounded bg-[#75a887] hover:bg-[#5c8a68] 
          disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-300">
          {localLab?.id ? 'Save Changes' : 'Add Lab'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-white px-4 py-2 rounded bg-[#a87583] hover:bg-[#8a5c66]">
          Close
        </button>
      </div>
    </form>
  );
}

LabFormFullSetup.propTypes = {
  localLab: PropTypes.object,
  setLocalLab: PropTypes.func.isRequired,
  errors: PropTypes.object,
  isExternalURI: PropTypes.bool,
  imageInputType: PropTypes.string,
  setImageInputType: PropTypes.func,
  imageUrls: PropTypes.array,
  imageLinkRef: PropTypes.object,
  imageUploadRef: PropTypes.object,
  handleImageChange: PropTypes.func,
  removeImage: PropTypes.func,
  localImages: PropTypes.array,
  docInputType: PropTypes.string,
  setDocInputType: PropTypes.func,
  docUrls: PropTypes.array,
  docLinkRef: PropTypes.object,
  docUploadRef: PropTypes.object,
  handleDocChange: PropTypes.func,
  removeDoc: PropTypes.func,
  localDocs: PropTypes.array,
  nameRef: PropTypes.object,
  categoryRef: PropTypes.object,
  keywordsRef: PropTypes.object,
  descriptionRef: PropTypes.object,
  priceRef: PropTypes.object,
  authRef: PropTypes.object,
  accessURIRef: PropTypes.object,
  accessKeyRef: PropTypes.object,
  timeSlotsRef: PropTypes.object,
  opensRef: PropTypes.object,
  closesRef: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}
