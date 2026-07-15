/**
 * @jest-environment node
 */

import {
  buildStoredFilename,
  detectUploadContentType,
  getSessionUploadNamespace,
  parseManagedFilePath,
  validateDestinationFolder,
} from '../fileSecurity'

describe('file storage security helpers', () => {
  test('uses a stable server-derived namespace that changes with the session', () => {
    const first = getSessionUploadNamespace({ sessionId: 'session-a', id: 'user-a' })
    const second = getSessionUploadNamespace({ sessionId: 'session-b', id: 'user-a' })

    expect(first).toMatch(/^[a-f0-9]{32}$/)
    expect(second).toMatch(/^[a-f0-9]{32}$/)
    expect(first).not.toBe(second)
  })

  test('accepts only the supported destination folders', () => {
    expect(validateDestinationFolder('images')).toBe('images')
    expect(validateDestinationFolder('docs')).toBe('docs')
    expect(() => validateDestinationFolder('arbitrary')).toThrow(/destination folder/i)
    expect(() => validateDestinationFolder('../public')).toThrow(/destination folder/i)
  })

  test('detects content from bytes and rejects SVG active content', () => {
    expect(detectUploadContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'application/pdf')).toBe('image/png')
    expect(() => detectUploadContentType(
      Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/png',
    )).toThrow(/SVG/i)
  })

  test('generates a non-overwriting UUID filename without trusting the original name', () => {
    const stored = buildStoredFilename('../avatar.png')

    expect(stored).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(stored).not.toContain('avatar')
  })

  test('parses only managed temporary paths', () => {
    expect(parseManagedFilePath('/temp/0123456789abcdef0123456789abcdef/images/123e4567-e89b-12d3-a456-426614174000.png'))
      .toMatchObject({ kind: 'temporary', namespace: '0123456789abcdef0123456789abcdef', folder: 'images' })
    expect(() => parseManagedFilePath('/temp/other/images/file.png')).toThrow(/managed/i)
    expect(() => parseManagedFilePath('/etc/passwd')).toThrow(/managed/i)
  })
})
