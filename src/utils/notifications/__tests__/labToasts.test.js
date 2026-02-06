import {
  labToastIds,
  notifyLabCollectFailed,
  notifyLabCollected,
  notifyLabCollectStarted,
  notifyLabCreateCancelled,
  notifyLabCreated,
  notifyLabCreatedFilesWarning,
  notifyLabCreatedMetadataWarning,
  notifyLabCreateFailed,
  notifyLabDeleted,
  notifyLabDeletedCascadeWarning,
  notifyLabDeleteFailed,
  notifyLabDeleteStarted,
  notifyLabInvalidPrice,
  notifyLabListed,
  notifyLabListingRequested,
  notifyLabListFailed,
  notifyLabMetadataSaveFailed,
  notifyLabMetadataUpdated,
  notifyLabNoChanges,
  notifyLabUnlisted,
  notifyLabUnlistFailed,
  notifyLabUpdated,
  notifyLabUpdateFailed,
  notifyLabUpdateStarted,
} from '../labToasts'

describe('labToasts', () => {
  const addTemporaryNotification = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('normalizes lab id in dedupe keys', () => {
    expect(labToastIds.created(7)).toBe('lab-created:7')
    expect(labToastIds.created(undefined)).toBe('lab-created:unknown')
  })

  test('emits creation/update metadata toasts via unified notification signature', () => {
    notifyLabCreated(addTemporaryNotification, 1)
    notifyLabCreateFailed(addTemporaryNotification, 'backend error')
    notifyLabCreateCancelled(addTemporaryNotification)
    notifyLabCreatedFilesWarning(addTemporaryNotification, 1, 'move failed')
    notifyLabCreatedMetadataWarning(addTemporaryNotification, 1, 'save failed')
    notifyLabInvalidPrice(addTemporaryNotification)
    notifyLabUpdateStarted(addTemporaryNotification, 1)
    notifyLabUpdated(addTemporaryNotification, 1)
    notifyLabUpdateFailed(addTemporaryNotification, 1, 'tx reverted')
    notifyLabMetadataUpdated(addTemporaryNotification, 1)
    notifyLabMetadataSaveFailed(addTemporaryNotification, 1, 'invalid json')
    notifyLabNoChanges(addTemporaryNotification, 1)

    const calls = addTemporaryNotification.mock.calls
    expect(calls).toHaveLength(12)
    expect(calls[0][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-created:1', dedupeWindowMs: 20000 }))
    expect(calls[1][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-create-failed', dedupeWindowMs: 20000 }))
    expect(calls[2][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-create-cancelled', dedupeWindowMs: 20000 }))
    expect(calls[3][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-create-files-warning:1', dedupeWindowMs: 20000 }))
    expect(calls[4][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-create-metadata-warning:1', dedupeWindowMs: 20000 }))
    expect(calls[5][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-invalid-price', dedupeWindowMs: 20000 }))
    expect(calls[6][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-update-started:1', dedupeWindowMs: 20000 }))
    expect(calls[7][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-updated:1', dedupeWindowMs: 20000 }))
    expect(calls[8][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-update-failed:1', dedupeWindowMs: 20000 }))
    expect(calls[9][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-metadata-updated:1', dedupeWindowMs: 20000 }))
    expect(calls[10][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-metadata-save-failed:1', dedupeWindowMs: 20000 }))
    expect(calls[11][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-no-changes:1', dedupeWindowMs: 20000 }))
  })

  test('emits deletion/listing/collect toasts via unified notification signature', () => {
    notifyLabDeleteStarted(addTemporaryNotification, 1)
    notifyLabDeleted(addTemporaryNotification, 1)
    notifyLabDeletedCascadeWarning(addTemporaryNotification, 1)
    notifyLabDeleteFailed(addTemporaryNotification, 1, 'cannot delete')
    notifyLabListingRequested(addTemporaryNotification, 1)
    notifyLabListed(addTemporaryNotification, 1)
    notifyLabListFailed(addTemporaryNotification, 1, 'cannot list')
    notifyLabUnlisted(addTemporaryNotification, 1)
    notifyLabUnlistFailed(addTemporaryNotification, 1, 'cannot unlist')
    notifyLabCollectStarted(addTemporaryNotification)
    notifyLabCollected(addTemporaryNotification)
    notifyLabCollectFailed(addTemporaryNotification, 'transfer failed')

    const calls = addTemporaryNotification.mock.calls
    expect(calls).toHaveLength(12)
    expect(calls[0][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-delete-started:1' }))
    expect(calls[1][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-deleted:1' }))
    expect(calls[2][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-delete-cascade-warning:1' }))
    expect(calls[3][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-delete-failed:1' }))
    expect(calls[4][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-list-requested:1' }))
    expect(calls[5][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-listed:1' }))
    expect(calls[6][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-list-failed:1' }))
    expect(calls[7][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-unlisted:1' }))
    expect(calls[8][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-unlist-failed:1' }))
    expect(calls[9][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-collect-started' }))
    expect(calls[10][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-collected' }))
    expect(calls[11][3]).toEqual(expect.objectContaining({ dedupeKey: 'lab-collect-failed' }))
  })

  test('no-ops when callback is not provided', () => {
    expect(() => notifyLabCreated(undefined, 1)).not.toThrow()
    expect(() => notifyLabCollectFailed(null, 'x')).not.toThrow()
  })
})

