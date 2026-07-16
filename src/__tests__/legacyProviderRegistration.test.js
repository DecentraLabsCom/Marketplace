import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LEGACY_ROUTE = '/api/provider/saveRegistration'

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectSourceFiles(fullPath)
    }
    return /\.(?:js|jsx)$/.test(entry.name) ? [fullPath] : []
  })
}

describe('legacy manual provider registration retirement', () => {
  test('removes the unauthenticated endpoint and manual registration form', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'src/app/api/provider/saveRegistration/route.js'))).toBe(false)
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'src/components/register/ProviderRegisterForm.js'))).toBe(false)
  })

  test('does not retain callers for the retired endpoint', () => {
    const sourceDirectories = [
      path.join(PROJECT_ROOT, 'src/app'),
      path.join(PROJECT_ROOT, 'src/components'),
      path.join(PROJECT_ROOT, 'src/hooks'),
    ]
    const callers = sourceDirectories
      .flatMap(collectSourceFiles)
      .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes(LEGACY_ROUTE))

    expect(callers).toEqual([])
  })
})
