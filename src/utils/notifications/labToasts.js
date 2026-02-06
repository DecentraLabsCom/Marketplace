const normalizeLabId = (labId) => {
  if (labId === undefined || labId === null) return 'unknown'
  return String(labId)
}

export const labToastIds = {
  created: (labId) => `lab-created:${normalizeLabId(labId)}`,
  createFailed: () => 'lab-create-failed',
  createCancelled: () => 'lab-create-cancelled',
  createFilesWarning: (labId) => `lab-create-files-warning:${normalizeLabId(labId)}`,
  createMetadataWarning: (labId) => `lab-create-metadata-warning:${normalizeLabId(labId)}`,
  invalidPrice: () => 'lab-invalid-price',
  updateStarted: (labId) => `lab-update-started:${normalizeLabId(labId)}`,
  updated: (labId) => `lab-updated:${normalizeLabId(labId)}`,
  updateFailed: (labId) => `lab-update-failed:${normalizeLabId(labId)}`,
  metadataUpdated: (labId) => `lab-metadata-updated:${normalizeLabId(labId)}`,
  metadataSaveFailed: (labId) => `lab-metadata-save-failed:${normalizeLabId(labId)}`,
  noChanges: (labId) => `lab-no-changes:${normalizeLabId(labId)}`,
  deleting: (labId) => `lab-delete-started:${normalizeLabId(labId)}`,
  deleted: (labId) => `lab-deleted:${normalizeLabId(labId)}`,
  deletedCascadeWarning: (labId) => `lab-delete-cascade-warning:${normalizeLabId(labId)}`,
  deleteFailed: (labId) => `lab-delete-failed:${normalizeLabId(labId)}`,
  listingRequested: (labId) => `lab-list-requested:${normalizeLabId(labId)}`,
  listed: (labId) => `lab-listed:${normalizeLabId(labId)}`,
  listFailed: (labId) => `lab-list-failed:${normalizeLabId(labId)}`,
  unlisted: (labId) => `lab-unlisted:${normalizeLabId(labId)}`,
  unlistFailed: (labId) => `lab-unlist-failed:${normalizeLabId(labId)}`,
  collectStarted: () => 'lab-collect-started',
  collected: () => 'lab-collected',
  collectFailed: () => 'lab-collect-failed',
}

const notify = (addTemporaryNotification, type, message, dedupeKey, extraOptions = {}) => {
  if (typeof addTemporaryNotification !== 'function') return
  addTemporaryNotification(type, message, null, {
    dedupeKey,
    dedupeWindowMs: 20000,
    ...extraOptions,
  })
}

export const notifyLabCreated = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ Lab created!', labToastIds.created(labId))

export const notifyLabCreateFailed = (addTemporaryNotification, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to add lab: ${message}`, labToastIds.createFailed())

export const notifyLabCreateCancelled = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'warning', '⚠️ Lab creation cancelled (institution request aborted)', labToastIds.createCancelled())

export const notifyLabCreatedFilesWarning = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'warning', `⚠️ Lab created but some files failed to move: ${message}`, labToastIds.createFilesWarning(labId))

export const notifyLabCreatedMetadataWarning = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'warning', `⚠️ Lab created but metadata failed to save: ${message}`, labToastIds.createMetadataWarning(labId))

export const notifyLabInvalidPrice = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', '❌ Invalid price format. Please enter a valid number.', labToastIds.invalidPrice())

export const notifyLabUpdateStarted = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'pending', 'Updating lab onchain...', labToastIds.updateStarted(labId))

export const notifyLabUpdated = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ Lab updated!', labToastIds.updated(labId))

export const notifyLabUpdateFailed = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to update lab: ${message}`, labToastIds.updateFailed(labId))

export const notifyLabMetadataUpdated = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ Lab metadata updated!', labToastIds.metadataUpdated(labId))

export const notifyLabMetadataSaveFailed = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to save lab data: ${message}`, labToastIds.metadataSaveFailed(labId))

export const notifyLabNoChanges = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ No changes to save!', labToastIds.noChanges(labId))

export const notifyLabDeleteStarted = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'pending', 'Deleting lab...', labToastIds.deleting(labId))

export const notifyLabDeleted = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ Lab deleted!', labToastIds.deleted(labId))

export const notifyLabDeletedCascadeWarning = (addTemporaryNotification, labId) =>
  notify(
    addTemporaryNotification,
    'warning',
    '⚠️ Lab deleted successfully. All associated reservations have been automatically cancelled.',
    labToastIds.deletedCascadeWarning(labId)
  )

export const notifyLabDeleteFailed = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to delete lab: ${message}`, labToastIds.deleteFailed(labId))

export const notifyLabListingRequested = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'pending', 'Sending listing request...', labToastIds.listingRequested(labId))

export const notifyLabListed = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ Lab listed successfully!', labToastIds.listed(labId))

export const notifyLabListFailed = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to list lab: ${message}`, labToastIds.listFailed(labId))

export const notifyLabUnlisted = (addTemporaryNotification, labId) =>
  notify(addTemporaryNotification, 'success', '✅ Lab unlisted!', labToastIds.unlisted(labId))

export const notifyLabUnlistFailed = (addTemporaryNotification, labId, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to unlist lab: ${message}`, labToastIds.unlistFailed(labId))

export const notifyLabCollectStarted = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'pending', 'Collecting all balances...', labToastIds.collectStarted())

export const notifyLabCollected = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'success', '✅ Balance collected!', labToastIds.collected())

export const notifyLabCollectFailed = (addTemporaryNotification, message) =>
  notify(addTemporaryNotification, 'error', `❌ Failed to collect balances: ${message}`, labToastIds.collectFailed())

