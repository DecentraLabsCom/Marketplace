/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  requireLabOwner: jest.fn(),
  requireProviderRole: jest.fn(),
  HttpError: class MockHttpError extends Error {
    constructor(status, message, code = 'FORBIDDEN') {
      super(message)
      this.status = status
      this.code = code
    }
  },
  handleGuardError: jest.fn((error) => new Response(null, { status: error.status })),
}))

jest.mock('@/utils/isVercel', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}))

jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
  list: jest.fn(),
  del: jest.fn(),
}))

jest.mock('sharp', () => jest.fn())

jest.mock('@/utils/storage/documentMalwareScan', () => ({
  scanDocumentBuffer: jest.fn().mockResolvedValue({ scanned: true }),
  DocumentScanError: class DocumentScanError extends Error {},
}))

import { POST } from '../uploadFile/route'
import { HttpError, requireAuth, requireLabOwner, requireProviderRole } from '@/utils/auth/guards'
import getIsVercel from '@/utils/isVercel'
import { put } from '@vercel/blob'
import { scanDocumentBuffer } from '@/utils/storage/documentMalwareScan'

const mockRequireAuth = requireAuth
const mockRequireLabOwner = requireLabOwner
const mockRequireProviderRole = requireProviderRole

function uploadRequest({ labId = '7', destinationFolder = 'images', file }) {
  const formData = new FormData()
  formData.set('labId', labId)
  formData.set('destinationFolder', destinationFolder)
  if (file) formData.set('file', file)
  return { formData: async () => formData }
}

describe('/api/provider/uploadFile security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'provider-1', role: 'provider', sessionId: 'session-a' })
    mockRequireLabOwner.mockResolvedValue({})
    mockRequireProviderRole.mockImplementation((session) => session)
  })

  test('requires provider role for temporary uploads', async () => {
    mockRequireProviderRole.mockImplementation(() => {
      throw new HttpError(403, 'Provider access required', 'FORBIDDEN')
    })

    const response = await POST(uploadRequest({
      labId: 'temp',
      file: new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'image.png', { type: 'image/png' }),
    }))

    expect(response.status).toBe(403)
    expect(mockRequireProviderRole).toHaveBeenCalled()
  })

  test('rejects unknown destination folders before writing storage', async () => {
    const response = await POST(uploadRequest({
      destinationFolder: 'arbitrary',
      file: new File(['plain text'], 'notes.txt', { type: 'text/plain' }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_DESTINATION_FOLDER' })
    expect(mockRequireLabOwner).toHaveBeenCalledWith(expect.anything(), '7')
  })

  test('rejects SVG content even when the filename and client MIME claim an image', async () => {
    const response = await POST(uploadRequest({
      file: new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'image.png', { type: 'image/png' }),
    }))

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_FILE_CONTENT' })
  })

  test('uses the canonical data namespace for Vercel Blob uploads', async () => {
    getIsVercel.mockReturnValue(true)
    put.mockResolvedValue({ url: 'https://blob.example/data/7/images/upload.png' })

    const response = await POST(uploadRequest({
      labId: '7',
      destinationFolder: 'images',
      file: new File([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ], 'upload.png', { type: 'image/png' }),
    }))

    expect(response.status).toBe(201)
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^data\/7\/images\//),
      expect.any(Buffer),
      expect.objectContaining({ access: 'public' }),
    )
  })

  test('scans documents before storing them', async () => {
    const response = await POST(uploadRequest({
      labId: '7',
      destinationFolder: 'docs',
      file: new File([Buffer.from('%PDF-1.7\ncontents')], 'guide.pdf', { type: 'application/pdf' }),
    }))

    expect(response.status).toBe(201)
    expect(scanDocumentBuffer).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'application/pdf',
      filename: 'guide.pdf',
    }))
  })
})
