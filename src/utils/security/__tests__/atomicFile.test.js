import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeFileWithDescriptor } from '../atomicFile'

describe('writeFileWithDescriptor', () => {
  let temporaryDirectory

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-security-'))
  })

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  test('creates and overwrites a file through one opened descriptor', () => {
    const filePath = path.join(temporaryDirectory, 'rotation-metadata.json')

    writeFileWithDescriptor(filePath, '{"rotationCount":1}')
    writeFileWithDescriptor(filePath, '{"rotationCount":2}')

    expect(fs.readFileSync(filePath, 'utf8')).toBe('{"rotationCount":2}')
  })
})
