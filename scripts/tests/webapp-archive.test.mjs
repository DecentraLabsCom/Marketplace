import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const marketplaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const archiveBuilder = path.join(marketplaceRoot, 'scripts', 'lib', 'webapp_archive.py')
const pythonExecutable = process.env.PYTHON || 'python'

function createWebapp(sourcePath) {
  mkdirSync(sourcePath, { recursive: true })
  writeFileSync(path.join(sourcePath, 'index.html'), '<main>demo</main>')
  writeFileSync(path.join(sourcePath, 'app.js'), 'console.log("demo")')
}

function buildArchive(sourcePath, destinationPath) {
  return spawnSync(pythonExecutable, [archiveBuilder, sourcePath, destinationPath], {
    encoding: 'utf8',
  })
}

function inspectArchive(archivePath) {
  const script = `
import json, stat, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.dumps([
        {
            "name": item.filename,
            "dateTime": item.date_time,
            "mode": stat.S_IMODE(item.external_attr >> 16),
            "isFile": stat.S_ISREG(item.external_attr >> 16),
        }
        for item in archive.infolist()
    ]))
`
  const result = spawnSync(pythonExecutable, ['-c', script, archivePath], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('creates a deterministic archive with sorted relative files and fixed metadata', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'webapp-archive-'))
  try {
    const sourcePath = path.join(tempRoot, 'source')
    createWebapp(sourcePath)
    const firstArchive = path.join(tempRoot, 'first.zip')
    const secondArchive = path.join(tempRoot, 'second.zip')

    const firstBuild = buildArchive(sourcePath, firstArchive)
    assert.equal(firstBuild.status, 0, firstBuild.stderr)
    const secondBuild = buildArchive(sourcePath, secondArchive)
    assert.equal(secondBuild.status, 0, secondBuild.stderr)

    assert.deepEqual(readFileSync(firstArchive), readFileSync(secondArchive))
    assert.deepEqual(inspectArchive(firstArchive), [
      { name: 'app.js', dateTime: [1980, 1, 1, 0, 0, 0], mode: 0o644, isFile: true },
      { name: 'index.html', dateTime: [1980, 1, 1, 0, 0, 0], mode: 0o644, isFile: true },
    ])
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('rejects symbolic links in a webapp source tree', (context) => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'webapp-archive-link-'))
  try {
    const sourcePath = path.join(tempRoot, 'source')
    createWebapp(sourcePath)
    try {
      symlinkSync(path.join(sourcePath, 'index.html'), path.join(sourcePath, 'linked.html'), 'file')
    } catch (error) {
      if (['EACCES', 'EPERM', 'ENOTSUP'].includes(error.code)) {
        context.skip(`symbolic links are unavailable: ${error.message}`)
        return
      }
      throw error
    }

    const result = buildArchive(sourcePath, path.join(tempRoot, 'rejected.zip'))
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /symbolic link/i)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('requires index.html and keeps the destination outside the source tree', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'webapp-archive-validation-'))
  try {
    const sourcePath = path.join(tempRoot, 'source')
    mkdirSync(sourcePath)
    const missingIndex = buildArchive(sourcePath, path.join(tempRoot, 'missing-index.zip'))
    assert.notEqual(missingIndex.status, 0)
    assert.match(missingIndex.stderr, /index\.html/i)

    createWebapp(sourcePath)
    const nestedDestination = buildArchive(sourcePath, path.join(sourcePath, 'bundle.zip'))
    assert.notEqual(nestedDestination.status, 0)
    assert.match(nestedDestination.stderr, /inside the source/i)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})
