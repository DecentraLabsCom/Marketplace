import fs from 'fs'
import path from 'path'

const SRC_ROOT = path.resolve(__dirname, '../../../')
const ALLOWED_FILES = new Set([
  'src/context/NotificationContext.js',
  'src/utils/notifications/institutionToasts.js',
  'src/utils/notifications/labToasts.js',
  'src/utils/notifications/reservationToasts.js',
  'src/utils/notifications/userDashboardToasts.js',
])

const collectJsFiles = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

describe('toast architecture', () => {
  test('uses addTemporaryNotification only in centralized notification layers', () => {
    const files = collectJsFiles(SRC_ROOT)
    const offenders = []

    for (const filePath of files) {
      const relativePath = `src/${path.relative(SRC_ROOT, filePath).replace(/\\/g, '/')}`
      if (relativePath.includes('__tests__/')) continue
      if (ALLOWED_FILES.has(relativePath)) continue

      const content = fs.readFileSync(filePath, 'utf8')
      if (/\baddTemporaryNotification\s*\(/.test(content)) {
        offenders.push(relativePath)
      }
    }

    expect(offenders).toEqual([])
  })
})
