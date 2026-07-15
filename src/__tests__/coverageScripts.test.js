import fs from 'node:fs'
import path from 'node:path'

const packageJsonPath = path.resolve(process.cwd(), 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

describe('coverage scripts', () => {
  test('keeps the Cypress coverage reporter task available', () => {
    expect(packageJson.scripts['coverage:report']).toBeUndefined()
    expect(packageJson.scripts['coverage:summary']).toBe('node scripts/coverage-report.js')
  })
})
