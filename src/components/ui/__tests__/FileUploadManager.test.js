/**
 * Unit tests for FileUploadManager component
 * 
 * Coverage:
 * - URL validation and addition
 * - File type validation (images vs documents)
 * - Maximum file limit enforcement
 * - Upload error handling
 * - Input mode switching
 * - Disabled state behavior
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileUploadManager from '../FileUploadManager'
import * as devLogger from '@/utils/dev/logger'

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    const { unoptimized, ...restProps } = props
    return <img {...restProps} />
  }
}))

beforeEach(() => {
  jest.clearAllMocks()
  global.alert = jest.fn()
  global.URL.createObjectURL = jest.fn(() => 'blob:fake-url')
  global.URL.revokeObjectURL = jest.fn()
})

afterAll(() => {
  delete global.alert
})

describe('FileUploadManager', () => {
  const defaultProps = {
    type: 'image',
    inputType: 'link',
    urls: [],
    files: [],
    onInputTypeChange: jest.fn(),
    onUrlAdd: jest.fn(),
    onUrlRemove: jest.fn(),
    onFileAdd: jest.fn(),
    onFileRemove: jest.fn(),
    onFileUpload: jest.fn(),
    labId: 'lab-123',
    disabled: false,
    maxFiles: 3
  }

  const createMockFile = (name, type, size = 1024) => {
    return new File(['x'.repeat(size)], name, { type })
  }

  describe('URL Management', () => {
    // Validates that malformed URLs are rejected with user feedback
    test('rejects invalid URLs with alert', async () => {
      render(<FileUploadManager {...defaultProps} />)
      
      const urlInput = screen.getByPlaceholderText(/Enter image URL/i)
      const addButton = screen.getByRole('button', { name: /add/i })
      
      await userEvent.type(urlInput, 'not-a-url')
      await userEvent.click(addButton)
      
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('Please enter a valid image URL')
      )
      expect(defaultProps.onUrlAdd).not.toHaveBeenCalled()
    })

    // Ensures URLs are sanitized (trimmed) before being added
    test('accepts and trims valid URLs', async () => {
      const onUrlAdd = jest.fn()
      render(<FileUploadManager {...defaultProps} onUrlAdd={onUrlAdd} />)
      
      const urlInput = screen.getByPlaceholderText(/Enter image URL/i)
      const addButton = screen.getByRole('button', { name: /add/i })
      
      await userEvent.type(urlInput, '  https://example.com/image.jpg  ')
      await userEvent.click(addButton)
      
      expect(onUrlAdd).toHaveBeenCalledWith('https://example.com/image.jpg')
      expect(urlInput).toHaveValue('')
    })

    // Verifies that URLs can be removed by index
    test('removes URL at specified index', () => {
      const onUrlRemove = jest.fn()
      const urls = ['https://example.com/1.jpg', 'https://example.com/2.jpg']
      
      render(<FileUploadManager {...defaultProps} urls={urls} onUrlRemove={onUrlRemove} />)
      
      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      fireEvent.click(removeButtons[0])
      
      expect(onUrlRemove).toHaveBeenCalledWith(0)
    })
  })

  describe('File Validation', () => {
    // Ensures only valid image MIME types are accepted when type='image'
    test('filters non-image files with alert', async () => {
      const onFileAdd = jest.fn()
      render(<FileUploadManager {...defaultProps} inputType="upload" onFileAdd={onFileAdd} />)
      
      const fileInput = document.querySelector('input[type="file"]')
      const validImage = createMockFile('photo.jpg', 'image/jpeg')
      const textFile = createMockFile('document.txt', 'text/plain')
      
      Object.defineProperty(fileInput, 'files', {
        value: [validImage, textFile],
        writable: false
      })
      
      fireEvent.change(fileInput)
      
      expect(onFileAdd).toHaveBeenCalledTimes(1)
      expect(onFileAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'photo.jpg', type: 'image/jpeg' })
      )
      expect(global.alert).toHaveBeenCalledWith('Please select valid image files')
    })

    // Prevents adding files beyond the configured maximum limit
    test('enforces maximum file limit', () => {
      const onFileAdd = jest.fn()
      const existingFiles = [
        createMockFile('existing1.jpg', 'image/jpeg'),
        createMockFile('existing2.jpg', 'image/jpeg')
      ]
      
      render(
        <FileUploadManager 
          {...defaultProps}
          inputType="upload"
          files={existingFiles}
          onFileAdd={onFileAdd}
          maxFiles={3}
        />
      )
      
      const fileInput = document.querySelector('input[type="file"]')
      const newFiles = [
        createMockFile('new1.jpg', 'image/jpeg'),
        createMockFile('new2.jpg', 'image/jpeg')
      ]
      
      Object.defineProperty(fileInput, 'files', {
        value: newFiles,
        writable: false
      })
      
      fireEvent.change(fileInput)
      
      expect(global.alert).toHaveBeenCalledWith('Maximum 3 images allowed')
      expect(onFileAdd).not.toHaveBeenCalled()
    })
  })

  describe('Upload Functionality', () => {
    // Verifies successful upload flow with correct parameters
    test('triggers upload with correct parameters', async () => {
      const onFileUpload = jest.fn().mockResolvedValue(undefined)
      const files = [createMockFile('upload.jpg', 'image/jpeg')]
      
      render(
        <FileUploadManager 
          {...defaultProps}
          inputType="upload"
          files={files}
          onFileUpload={onFileUpload}
          labId="lab-456"
        />
      )
      
      const uploadButton = screen.getByRole('button', { name: /Upload Images/i })
      await userEvent.click(uploadButton)
      
      expect(onFileUpload).toHaveBeenCalledWith(files, 'image', 'lab-456')
    })

    // Critical: Ensures graceful error handling with user feedback and logging
    test('handles upload errors gracefully', async () => {
      const uploadError = new Error('Network error: Upload failed')
      const onFileUpload = jest.fn().mockRejectedValue(uploadError)
      const files = [createMockFile('error.jpg', 'image/jpeg')]
      
      render(
        <FileUploadManager 
          {...defaultProps}
          inputType="upload"
          files={files}
          onFileUpload={onFileUpload}
          labId="lab-789"
        />
      )
      
      const uploadButton = screen.getByRole('button', { name: /Upload Images/i })
      await userEvent.click(uploadButton)
      
      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(
          'Failed to upload images. Please try again.'
        )
      })
      
      expect(devLogger.error).toHaveBeenCalledWith('Image upload failed:', uploadError)
      expect(onFileUpload).toHaveBeenCalledWith(files, 'image', 'lab-789')
    })
  })

  describe('UI Controls', () => {
    // Ensures radio button switching triggers the correct callback
    test('switches between link and upload modes', async () => {
      const onInputTypeChange = jest.fn()
      render(<FileUploadManager {...defaultProps} onInputTypeChange={onInputTypeChange} />)
      
      const uploadRadio = screen.getByRole('radio', { name: /File Upload/i })
      
      expect(screen.getByRole('radio', { name: /URL Link/i })).toBeChecked()
      
      await userEvent.click(uploadRadio)
      expect(onInputTypeChange).toHaveBeenCalledWith('upload')
    })

    // Verifies all interactive elements respect the disabled prop
    test('disables all controls when disabled prop is true', () => {
      render(<FileUploadManager {...defaultProps} disabled={true} />)
      
      expect(screen.getByRole('radio', { name: /URL Link/i })).toBeDisabled()
      expect(screen.getByRole('radio', { name: /File Upload/i })).toBeDisabled()
      expect(screen.getByPlaceholderText(/Enter image URL/i)).toBeDisabled()
      expect(screen.getByRole('button', { name: /Add/i })).toBeDisabled()
    })
  })
})